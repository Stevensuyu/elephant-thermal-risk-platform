from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path


DEFAULT_DATA_YAML = Path("data/elephant_multisource_thermal.yaml")
DEFAULT_BASE_WEIGHTS = Path(
    "runs/detect/runs/elephant_multisource_thermal/yolov8n_elephant_multisource_8e/weights/best.pt"
)


def run_prepare_if_needed(prepare: bool, data_yaml: Path) -> None:
    if data_yaml.exists() and not prepare:
        return
    prepare_script = Path("prepare_elephant_multisource_thermal_yolo.py")
    if not prepare_script.exists():
        raise SystemExit(f"缺少数据准备脚本：{prepare_script}")
    subprocess.run([sys.executable, str(prepare_script)], check=True)
    if not data_yaml.exists():
        raise SystemExit(f"数据准备完成后仍未找到 YOLO 配置：{data_yaml}")


def pick_device_and_size(device: str, imgsz: int, batch: int) -> tuple[str, int, int, dict]:
    info: dict = {"requested_device": device, "cuda": False}
    if device != "auto":
        return device, imgsz, batch, info

    try:
        import torch
    except ImportError:
        return "cpu", min(imgsz, 320), min(batch, 8), info

    if not torch.cuda.is_available():
        return "cpu", min(imgsz, 320), min(batch, 8), info

    props = torch.cuda.get_device_properties(0)
    total_gb = round(props.total_memory / 1024**3, 2)
    info.update({"cuda": True, "gpu_name": props.name, "gpu_memory_gb": total_gb})
    if total_gb < 8:
        return "0", min(imgsz, 320), min(batch, 8), info
    return "0", imgsz, batch, info


def get_weights_path(requested: str) -> str:
    if requested:
        candidate = Path(requested)
        if candidate.exists():
            return str(candidate)
    if DEFAULT_BASE_WEIGHTS.exists():
        return str(DEFAULT_BASE_WEIGHTS)
    return "yolov8n.pt"


def dataset_root_from_yaml(data_yaml: Path) -> Path:
    try:
        import yaml
    except ImportError:
        return data_yaml.parent

    data = yaml.safe_load(data_yaml.read_text(encoding="utf-8")) or {}
    root = Path(str(data.get("path", data_yaml.parent)))
    if not root.is_absolute():
        root = root if root.exists() else data_yaml.parent / root
    return root


def json_safe(value: object) -> object:
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            return str(value)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def export_summary(output_dir: Path, args: argparse.Namespace, device_info: dict, metrics: object | None) -> Path:
    summary_path = output_dir / "training_summary.json"
    results_dict = json_safe(getattr(metrics, "results_dict", {}) if metrics is not None else {})
    summary = {
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "run_dir": str(output_dir),
        "best_pt": str(output_dir / "weights" / "best.pt"),
        "last_pt": str(output_dir / "weights" / "last.pt"),
        "data": str(Path(args.data).resolve()),
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "batch": args.batch,
        "patience": args.patience,
        "device": device_info,
        "metrics": results_dict,
        "note": "该结果用于平台模型研发和论文原型验证；真实部署效果仍需实地数据继续验证。",
    }
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary_path


def zip_run(output_dir: Path) -> Path:
    archive_base = output_dir.parent / f"{output_dir.name}_artifact"
    archive = shutil.make_archive(str(archive_base), "zip", output_dir)
    return Path(archive)


def main() -> None:
    parser = argparse.ArgumentParser(description="继续训练象热成像 YOLO 模型。")
    parser.add_argument("--data", default=str(DEFAULT_DATA_YAML), help="YOLO data.yaml 路径")
    parser.add_argument("--weights", default="", help="继续训练的 best.pt；为空时自动使用当前项目 best.pt 或 yolov8n.pt")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--patience", type=int, default=10)
    parser.add_argument("--device", default="auto", help="auto、cpu 或 GPU 编号，例如 0")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--project", default="runs/elephant_multisource_thermal")
    parser.add_argument("--name", default="continue_elephant_yolo")
    parser.add_argument("--prepare", action="store_true", help="训练前重新生成多源 elephant 数据集")
    parser.add_argument("--predict", action="store_true", help="训练后生成验证集预测样例")
    parser.add_argument("--zip", action="store_true", help="训练后压缩输出目录，便于保存或迁移结果")
    args = parser.parse_args()

    data_yaml = Path(args.data)
    run_prepare_if_needed(args.prepare, data_yaml)

    device, args.imgsz, args.batch, device_info = pick_device_and_size(args.device, args.imgsz, args.batch)
    weights_path = get_weights_path(args.weights)

    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise SystemExit("缺少 ultralytics，请先运行：python -m pip install -r requirements-training.txt") from exc

    model = YOLO(weights_path)
    train_results = model.train(
        data=str(data_yaml),
        imgsz=args.imgsz,
        epochs=args.epochs,
        batch=args.batch,
        device=device,
        workers=args.workers,
        project=args.project,
        name=args.name,
        patience=args.patience,
        exist_ok=True,
        plots=True,
    )

    output_dir = Path(getattr(train_results, "save_dir", Path(args.project) / args.name))
    best_weights = output_dir / "weights" / "best.pt"
    metrics = None
    if best_weights.exists():
        metrics = YOLO(str(best_weights)).val(data=str(data_yaml), device=device, plots=True)
        if args.predict:
            dataset_root = dataset_root_from_yaml(data_yaml)
            YOLO(str(best_weights)).predict(
                source=str(dataset_root / "valid" / "images"),
                imgsz=args.imgsz,
                conf=0.25,
                device=device,
                project=args.project,
                name=f"{args.name}_predictions",
                save=True,
                exist_ok=True,
            )

    summary_path = export_summary(output_dir, args, device_info, metrics)
    print(f"训练完成：{output_dir}")
    print(f"摘要文件：{summary_path}")
    if args.zip:
        print(f"结果压缩包：{zip_run(output_dir)}")


if __name__ == "__main__":
    main()

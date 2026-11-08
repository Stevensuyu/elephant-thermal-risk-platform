from __future__ import annotations

from pathlib import Path


DATA_YAML = Path("data/multisource_thermal_animals.yaml")


def main() -> None:
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise SystemExit("请先安装依赖：python -m pip install ultralytics") from exc

    if not DATA_YAML.exists():
        raise SystemExit("未找到多源数据配置，请先运行 prepare_multisource_thermal_yolo.py")

    model = YOLO("yolov8n.pt")
    model.train(
        data=str(DATA_YAML),
        imgsz=320,
        epochs=20,
        batch=4,
        device="cpu",
        workers=0,
        project="runs/multisource_thermal_animals",
        name="yolov8n_multisource_thermal_20e",
        exist_ok=True,
        plots=True,
    )


if __name__ == "__main__":
    main()

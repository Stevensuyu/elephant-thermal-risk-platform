from __future__ import annotations

import argparse
import math
import shutil
from pathlib import Path


VIDEO_SUFFIXES = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
IMAGE_SUFFIX = ".jpg"


def split_name(index: int) -> str:
    bucket = index % 10
    if bucket == 0:
        return "test"
    if bucket == 1:
        return "valid"
    return "train"


def ensure_dirs(root: Path) -> None:
    for split in ["train", "valid", "test"]:
        (root / split / "images").mkdir(parents=True, exist_ok=True)
        (root / split / "labels").mkdir(parents=True, exist_ok=True)


def write_yaml(root: Path, class_names: list[str]) -> None:
    lines = [
        f"path: {root.resolve().as_posix()}",
        "train: train/images",
        "val: valid/images",
        "test: test/images",
        "names:",
        *[f"  {idx}: {name}" for idx, name in enumerate(class_names)],
        "",
    ]
    (root / "data.yaml").write_text("\n".join(lines), encoding="utf-8")


def label_frame(model, image_path: Path, label_path: Path, conf: float, imgsz: int) -> int:
    results = model.predict(str(image_path), conf=conf, imgsz=imgsz, verbose=False)
    lines: list[str] = []
    for result in results:
        if result.boxes is None:
            continue
        for cls, xywhn in zip(result.boxes.cls.tolist(), result.boxes.xywhn.tolist()):
            class_id = int(cls)
            x, y, w, h = xywhn
            lines.append(f"{class_id} {x:.6f} {y:.6f} {w:.6f} {h:.6f}")
    label_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return len(lines)


def extract_video(video_path: Path, output_root: Path, model, every_seconds: float, conf: float, imgsz: int, max_frames: int) -> tuple[int, int]:
    import cv2

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"无法打开视频：{video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    interval = max(1, int(math.ceil(fps * every_seconds)))
    frame_index = 0
    saved = 0
    boxes = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_index % interval == 0:
            split = split_name(saved)
            stem = f"user_video__{video_path.stem}__{saved:05d}"
            image_path = output_root / split / "images" / f"{stem}{IMAGE_SUFFIX}"
            label_path = output_root / split / "labels" / f"{stem}.txt"
            cv2.imwrite(str(image_path), frame)
            boxes += label_frame(model, image_path, label_path, conf, imgsz)
            saved += 1
            if max_frames and saved >= max_frames:
                break
        frame_index += 1

    cap.release()
    return saved, boxes


def main() -> None:
    parser = argparse.ArgumentParser(description="把本地视频抽帧并用当前 YOLO 模型生成伪标签，形成可训练 YOLO 数据集。")
    parser.add_argument("--input", default="user_materials/videos", help="视频文件夹或单个视频路径")
    parser.add_argument("--output", default="downloads/user-video-pseudolabels", help="输出 YOLO 数据集目录")
    parser.add_argument("--weights", default="runs/detect/runs/elephant_multisource_thermal/yolov8n_elephant_multisource_8e/weights/best.pt")
    parser.add_argument("--every-seconds", type=float, default=2.0, help="每隔多少秒抽一帧")
    parser.add_argument("--conf", type=float, default=0.35, help="伪标签置信度阈值")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--max-frames-per-video", type=int, default=300)
    parser.add_argument("--clean", action="store_true", help="先清空输出目录")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_root = Path(args.output)
    if args.clean and output_root.exists():
        shutil.rmtree(output_root)
    ensure_dirs(output_root)

    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise SystemExit("缺少 ultralytics，请先运行：python -m pip install -r requirements-training.txt") from exc

    weights = Path(args.weights)
    model = YOLO(str(weights if weights.exists() else "yolov8n.pt"))
    class_names = [model.names[idx] for idx in sorted(model.names)] if isinstance(model.names, dict) else list(model.names)

    if input_path.is_file():
        videos = [input_path]
    else:
        videos = [p for p in input_path.rglob("*") if p.suffix.lower() in VIDEO_SUFFIXES]
    if not videos:
        raise SystemExit(f"没有找到视频文件：{input_path}")

    total_frames = 0
    total_boxes = 0
    for video in videos:
        frames, boxes = extract_video(video, output_root, model, args.every_seconds, args.conf, args.imgsz, args.max_frames_per_video)
        print(f"{video.name}: frames={frames}, pseudo_boxes={boxes}")
        total_frames += frames
        total_boxes += boxes

    write_yaml(output_root, class_names)
    print(f"output: {output_root.resolve()}")
    print(f"total_frames={total_frames}, total_pseudo_boxes={total_boxes}")


if __name__ == "__main__":
    main()

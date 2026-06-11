from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Run real YOLO prediction and emit JSON.")
    parser.add_argument("--source", required=True, help="Image/video path or URL")
    parser.add_argument("--weights", default="yolov8n.pt", help="YOLO weights path")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    args = parser.parse_args()

    try:
        from ultralytics import YOLO
    except Exception as exc:
        raise SystemExit(f"ultralytics is not installed: {exc}")

    weights = Path(args.weights)
    model = YOLO(str(weights if weights.exists() else args.weights))
    results = model.predict(source=args.source, conf=args.conf, verbose=False)
    detections = []

    for result in results:
        names = result.names or {}
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            continue
        for box in boxes:
            xyxy = box.xyxy[0].tolist()
            cls_id = int(box.cls[0].item())
            detections.append(
                {
                    "label": str(names.get(cls_id, cls_id)),
                    "confidence": float(box.conf[0].item()),
                    "box": {
                        "x1": float(xyxy[0]),
                        "y1": float(xyxy[1]),
                        "x2": float(xyxy[2]),
                        "y2": float(xyxy[3]),
                    },
                }
            )

    print(
        json.dumps(
            {
                "model": str(weights),
                "source": args.source,
                "detections": detections,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()

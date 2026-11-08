from __future__ import annotations

import subprocess
import sys


def main() -> None:
    subprocess.run(
        [
            sys.executable,
            "train_elephant_yolo.py",
            "--data",
            "data/elephant_multisource_thermal.yaml",
            "--weights",
            "runs/detect/runs/multisource_thermal_animals/yolov8n_multisource_thermal_20e/weights/best.pt",
            "--epochs",
            "8",
            "--imgsz",
            "320",
            "--batch",
            "8",
            "--device",
            "cpu",
            "--workers",
            "0",
            "--project",
            "runs/elephant_multisource_thermal",
            "--name",
            "yolov8n_elephant_multisource_8e",
        ],
        check=True,
    )


if __name__ == "__main__":
    main()

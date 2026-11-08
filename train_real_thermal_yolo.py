from __future__ import annotations

from pathlib import Path


SOURCE_DIR = Path("downloads/thermal-dogs-and-people-x6ejw").resolve()
DATA_YAML = Path("data/real_thermal_dogs_people.yaml")


def main() -> None:
    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise SystemExit("请先安装依赖：python -m pip install ultralytics") from exc

    if not (SOURCE_DIR / "data.yaml").exists():
        raise SystemExit("未找到真实热成像数据集，请先下载 LibreYOLO/thermal-dogs-and-people-x6ejw。")

    DATA_YAML.parent.mkdir(exist_ok=True)
    DATA_YAML.write_text(
        "\n".join(
            [
                f"path: {SOURCE_DIR.as_posix()}",
                "train: train/images",
                "val: valid/images",
                "test: test/images",
                "names:",
                "  0: dog",
                "  1: person",
                "",
            ]
        ),
        encoding="utf-8",
    )

    model = YOLO("yolov8n.pt")
    model.train(
        data=str(DATA_YAML),
        imgsz=320,
        epochs=5,
        batch=4,
        device="cpu",
        workers=0,
        project="runs/real_thermal_dogs_people",
        name="yolov8n_real_thermal",
        exist_ok=True,
        plots=True,
    )


if __name__ == "__main__":
    main()

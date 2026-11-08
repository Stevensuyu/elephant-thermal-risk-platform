from __future__ import annotations

import shutil
from pathlib import Path


SOURCES = [
    {
        "name": "thermal_dogs_people",
        "root": Path("downloads/thermal-dogs-and-people-x6ejw"),
        "map": {0: 0, 1: 1},  # dog, person
    },
    {
        "name": "thermal_cheetah",
        "root": Path("downloads/thermal-cheetah-my4dp"),
        "map": {0: 2, 1: 1},  # cheetah, human -> person
    },
]

OUT = Path("data/multisource_thermal_animals")
YAML = Path("data/multisource_thermal_animals.yaml")
CLASS_NAMES = ["dog", "person", "cheetah"]


def remap_label(src: Path, dst: Path, class_map: dict[int, int]) -> None:
    lines: list[str] = []
    if src.exists():
        for raw in src.read_text(encoding="utf-8").splitlines():
            parts = raw.strip().split()
            if not parts:
                continue
            old_class = int(float(parts[0]))
            if old_class not in class_map:
                continue
            parts[0] = str(class_map[old_class])
            lines.append(" ".join(parts))
    dst.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)

    for split in ["train", "valid", "test"]:
        (OUT / split / "images").mkdir(parents=True, exist_ok=True)
        (OUT / split / "labels").mkdir(parents=True, exist_ok=True)

    summary: list[str] = []
    for source in SOURCES:
        root = source["root"]
        if not (root / "data.yaml").exists():
            raise SystemExit(f"缺少数据源：{root}")
        for split in ["train", "valid", "test"]:
            image_dir = root / split / "images"
            label_dir = root / split / "labels"
            count = 0
            for image_path in image_dir.glob("*"):
                if image_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
                    continue
                stem = f"{source['name']}__{image_path.stem}"
                dst_image = OUT / split / "images" / f"{stem}{image_path.suffix.lower()}"
                dst_label = OUT / split / "labels" / f"{stem}.txt"
                shutil.copy2(image_path, dst_image)
                remap_label(label_dir / f"{image_path.stem}.txt", dst_label, source["map"])
                count += 1
            summary.append(f"{source['name']} {split}: {count}")

    YAML.write_text(
        "\n".join(
            [
                f"path: {OUT.resolve().as_posix()}",
                "train: train/images",
                "val: valid/images",
                "test: test/images",
                "names:",
                *[f"  {idx}: {name}" for idx, name in enumerate(CLASS_NAMES)],
                "",
            ]
        ),
        encoding="utf-8",
    )
    print("\n".join(summary))
    print(f"yaml: {YAML.resolve()}")


if __name__ == "__main__":
    main()

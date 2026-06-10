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
    {
        "name": "elephant_thermal",
        "root": Path("downloads/elephant-thermal-images"),
        "map": {
            0: 3,  # elephant
            1: 3,  # numeric Roboflow class, treated as elephant per dataset note
            2: 3,  # numeric Roboflow class, treated as elephant per dataset note
            3: 3,  # numeric Roboflow class, treated as elephant per dataset note
            4: 4,  # animal
            5: 5,  # device
            6: 1,  # human -> person
            7: 6,  # unknown
        },
    },
    {
        "name": "hit_uav",
        "root": Path("downloads/hit-uav-yolo/hit-uav"),
        "optional": True,
        "split_map": {"train": "train", "valid": "val", "test": "test"},
        "layout": "images_first",
        "map": {
            0: 1,  # Person -> person
            1: 5,  # Car -> device/vehicle risk context
            2: 5,  # Bicycle -> device/vehicle risk context
            3: 5,  # OtherVehicle -> device/vehicle risk context
            # 4 DontCare is intentionally skipped.
        },
    },
    {
        "name": "user_video",
        "root": Path("downloads/user-video-pseudolabels"),
        "optional": True,
        "map": {
            0: 0,
            1: 1,
            2: 2,
            3: 3,
            4: 4,
            5: 5,
            6: 6,
        },
    },
]

OUT = Path("data/elephant_multisource_thermal")
YAML = Path("data/elephant_multisource_thermal.yaml")
CLASS_NAMES = ["dog", "person", "cheetah", "elephant", "animal", "device", "unknown"]


def remap_label(src: Path, dst: Path, class_map: dict[int, int]) -> int:
    count = 0
    lines: list[str] = []
    if src.exists():
        for raw in src.read_text(encoding="utf-8", errors="ignore").splitlines():
            parts = raw.strip().split()
            if not parts:
                continue
            old_class = int(float(parts[0]))
            if old_class not in class_map:
                continue
            parts[0] = str(class_map[old_class])
            lines.append(" ".join(parts))
            count += 1
    dst.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return count


def has_dataset_marker(root: Path) -> bool:
    return (root / "data.yaml").exists() or (root / "dataset.yaml").exists()


def source_dirs(root: Path, out_split: str, source: dict) -> tuple[Path, Path]:
    src_split = source.get("split_map", {}).get(out_split, out_split)
    if source.get("layout") == "images_first":
        return root / "images" / src_split, root / "labels" / src_split
    return root / src_split / "images", root / src_split / "labels"


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)

    for split in ["train", "valid", "test"]:
        (OUT / split / "images").mkdir(parents=True, exist_ok=True)
        (OUT / split / "labels").mkdir(parents=True, exist_ok=True)

    summary: list[str] = []
    for source in SOURCES:
        root = source["root"]
        if not has_dataset_marker(root):
            if source.get("optional"):
                summary.append(f"{source['name']}: skipped, missing optional source at {root}")
                continue
            raise SystemExit(f"缺少数据源：{root}")
        for split in ["train", "valid", "test"]:
            image_dir, label_dir = source_dirs(root, split, source)
            image_count = 0
            box_count = 0
            for image_path in image_dir.glob("*"):
                if image_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
                    continue
                stem = f"{source['name']}__{image_path.stem}"
                dst_image = OUT / split / "images" / f"{stem}{image_path.suffix.lower()}"
                dst_label = OUT / split / "labels" / f"{stem}.txt"
                shutil.copy2(image_path, dst_image)
                box_count += remap_label(label_dir / f"{image_path.stem}.txt", dst_label, source["map"])
                image_count += 1
            summary.append(f"{source['name']} {split}: {image_count} images, {box_count} boxes")

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

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = ROOT / "downloads"
MODELS = ROOT / "models"


MATERIALS = {
    "elephant": {
        "kind": "kaggle",
        "repo": "shijo96john/elephant-thermal-images",
        "target": DOWNLOADS / "elephant-thermal-images",
        "note": "象热成像 YOLO 数据，当前 elephant 类核心训练源。",
    },
    "hit_uav": {
        "kind": "kaggle",
        "repo": "pandrii000/hituav-a-highaltitude-infrared-thermal-dataset",
        "target": DOWNLOADS / "hit-uav-yolo",
        "note": "高空无人机红外图像，YOLO 标注，适合作为航拍热成像人/车背景迁移训练。",
    },
    "thermal_dogs_people": {
        "kind": "hf_dataset",
        "repo": "LibreYOLO/thermal-dogs-and-people-x6ejw",
        "target": DOWNLOADS / "thermal-dogs-and-people-x6ejw",
        "note": "热成像 dog/person YOLO 数据。",
    },
    "thermal_cheetah": {
        "kind": "hf_dataset",
        "repo": "LibreYOLO/thermal-cheetah-my4dp",
        "target": DOWNLOADS / "thermal-cheetah-my4dp",
        "note": "热成像 cheetah/human YOLO 数据。",
    },
    "bambi_model": {
        "kind": "hf_model",
        "repo": "cpraschl/bambi-thermal-detection",
        "target": MODELS / "bambi-thermal-detection",
        "note": "BAMBI 热成像动物检测预训练权重，可作为迁移训练参考权重。",
    },
}


def patch_kagglehub_compat() -> None:
    try:
        import kagglesdk.kaggle_env as kaggle_env
    except Exception:
        return
    if hasattr(kaggle_env, "get_web_endpoint"):
        return
    path = Path(kaggle_env.__file__)
    text = path.read_text(encoding="utf-8")
    if "def get_web_endpoint" not in text:
        text += "\n\n# Compatibility shim for kagglehub versions expecting this SDK symbol.\ndef get_web_endpoint(env=None):\n    return get_endpoint(env or get_env()).replace('api.', 'www.')\n"
        path.write_text(text, encoding="utf-8")
    if not hasattr(kaggle_env, "get_web_endpoint"):
        kaggle_env.get_web_endpoint = lambda env=None: kaggle_env.get_endpoint(env or kaggle_env.get_env()).replace("api.", "www.")


def copy_dataset_root(source: Path, target: Path) -> Path:
    candidates = [source] + [p for p in source.rglob("*") if p.is_dir()]
    dataset_root = next((p for p in candidates if (p / "data.yaml").exists()), source)
    if target.exists():
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(dataset_root, target)
    return target


def download_kaggle(repo: str, target: Path) -> Path:
    patch_kagglehub_compat()
    import kagglehub

    source = Path(kagglehub.dataset_download(repo))
    return copy_dataset_root(source, target)


def download_hf_dataset(repo: str, target: Path) -> Path:
    from huggingface_hub import snapshot_download

    snapshot_download(repo_id=repo, repo_type="dataset", local_dir=str(target))
    return target


def download_hf_model(repo: str, target: Path) -> Path:
    from huggingface_hub import snapshot_download

    snapshot_download(repo_id=repo, local_dir=str(target))
    return target


def count_yolo_dataset(root: Path) -> tuple[int, int]:
    images = 0
    labels = 0
    for split in ["train", "valid", "val", "test"]:
        image_dir = root / split / "images"
        label_dir = root / split / "labels"
        if image_dir.exists():
            images += sum(1 for p in image_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"})
        if label_dir.exists():
            labels += sum(1 for p in label_dir.iterdir() if p.suffix.lower() == ".txt")
    return images, labels


def main() -> None:
    parser = argparse.ArgumentParser(description="下载可用于象热成像/无人机红外迁移训练的公开材料。")
    parser.add_argument("--all", action="store_true", help="下载推荐的小中型材料，不包含 BAMBI 9.4GB 大数据集。")
    parser.add_argument("--elephant", action="store_true")
    parser.add_argument("--hit-uav", action="store_true")
    parser.add_argument("--thermal-dogs-people", action="store_true")
    parser.add_argument("--thermal-cheetah", action="store_true")
    parser.add_argument("--bambi-model", action="store_true")
    args = parser.parse_args()

    selected = []
    if args.all or args.elephant:
        selected.append("elephant")
    if args.all or args.hit_uav:
        selected.append("hit_uav")
    if args.all or args.thermal_dogs_people:
        selected.append("thermal_dogs_people")
    if args.all or args.thermal_cheetah:
        selected.append("thermal_cheetah")
    if args.all or args.bambi_model:
        selected.append("bambi_model")
    if not selected:
        parser.print_help()
        return

    DOWNLOADS.mkdir(exist_ok=True)
    MODELS.mkdir(exist_ok=True)

    for key in selected:
        item = MATERIALS[key]
        print(f"\n==> {key}: {item['note']}")
        try:
            if item["kind"] == "kaggle":
                target = download_kaggle(item["repo"], item["target"])
            elif item["kind"] == "hf_dataset":
                target = download_hf_dataset(item["repo"], item["target"])
            elif item["kind"] == "hf_model":
                target = download_hf_model(item["repo"], item["target"])
            else:
                raise ValueError(item["kind"])
            images, labels = count_yolo_dataset(target)
            print(f"ready: {target}")
            if images or labels:
                print(f"images={images}, labels={labels}")
        except Exception as exc:
            print(f"failed: {key}: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()

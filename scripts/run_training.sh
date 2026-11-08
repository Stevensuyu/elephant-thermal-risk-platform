#!/usr/bin/env bash
set -euo pipefail

python -m pip install -r requirements-training.txt
python scripts/download_training_materials.py --all
if [ -d "user_materials/videos" ]; then
  python scripts/video_to_yolo_dataset.py --input user_materials/videos --clean
fi
python prepare_elephant_multisource_thermal_yolo.py
python train_elephant_yolo.py \
  --data data/elephant_multisource_thermal.yaml \
  --epochs "${EPOCHS:-30}" \
  --imgsz "${IMGSZ:-640}" \
  --batch "${BATCH:-16}" \
  --device auto \
  --workers "${WORKERS:-2}" \
  --project runs/elephant_multisource_thermal \
  --name continue_elephant_yolo \
  --predict \
  --zip

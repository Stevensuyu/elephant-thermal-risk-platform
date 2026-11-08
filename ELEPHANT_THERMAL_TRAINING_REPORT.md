# 象热成像多源 YOLO 训练报告

## 已导入资料

1. `shijo96john/elephant-thermal-images`
   - 来源：Kaggle / Roboflow Universe
   - 许可：CC BY 4.0
   - 本地路径：`downloads/elephant-thermal-images`
   - 原始规模：2939 images
   - 说明：README 标注为 `Elephant are annotated in YOLOv8 format`

2. `LibreYOLO/thermal-dogs-and-people-x6ejw`
   - 来源：Hugging Face / Roboflow Universe
   - 许可：CC BY 4.0
   - 本地路径：`downloads/thermal-dogs-and-people-x6ejw`

3. `LibreYOLO/thermal-cheetah-my4dp`
   - 来源：Hugging Face / Roboflow Universe
   - 许可：CC BY 4.0
   - 本地路径：`downloads/thermal-cheetah-my4dp`

## 类别映射

统一类别：

- `0`: dog
- `1`: person
- `2`: cheetah
- `3`: elephant
- `4`: animal
- `5`: device
- `6`: unknown

Kaggle 象热成像数据中原始 `0/1/2/3` 数字类统一映射为 `elephant`；`human` 映射为 `person`；`animal/device/unknown` 作为辅助风险目标保留。

## 统一后的数据结构

数据目录：

`data/elephant_multisource_thermal`

YOLO 配置：

`data/elephant_multisource_thermal.yaml`

数据量：

- train: 2566 images
- valid: 461 images
- test: 244 images
- total: 3271 images

## 训练命令

```bash
python prepare_elephant_multisource_thermal_yolo.py
python train_elephant_multisource_thermal_yolo.py
```

训练设置：

- Base model: previous multisource thermal YOLOv8n weights
- Image size: 320
- Epochs: 8
- Batch: 8
- Device: CPU

## 验证指标

整体 7 类指标：

- Precision: 0.653
- Recall: 0.592
- mAP50: 0.587
- mAP50-95: 0.413

核心 elephant 类指标：

- Precision: 0.976
- Recall: 0.973
- mAP50: 0.989
- mAP50-95: 0.751

按类别摘要：

- dog: P 0.736, R 1.000, mAP50 0.971, mAP50-95 0.881
- person: P 0.506, R 0.780, mAP50 0.744, mAP50-95 0.497
- cheetah: P 0.626, R 0.744, mAP50 0.745, mAP50-95 0.474
- elephant: P 0.976, R 0.973, mAP50 0.989, mAP50-95 0.751
- animal: P 0.558, R 0.556, mAP50 0.487, mAP50-95 0.214
- device: P 0.171, R 0.091, mAP50 0.148, mAP50-95 0.056
- unknown: P 1.000, R 0.000, mAP50 0.028, mAP50-95 0.018

## 输出文件

- 权重：`runs/detect/runs/elephant_multisource_thermal/yolov8n_elephant_multisource_8e/weights/best.pt`
- 训练曲线：`runs/detect/runs/elephant_multisource_thermal/yolov8n_elephant_multisource_8e/results.png`
- 混淆矩阵：`runs/detect/runs/elephant_multisource_thermal/yolov8n_elephant_multisource_8e/confusion_matrix.png`
- 标签分布：`runs/detect/runs/elephant_multisource_thermal/yolov8n_elephant_multisource_8e/labels.jpg`
- 推理样例：`runs/detect/runs/elephant_multisource_thermal_predict/valid_predictions`

## 论文和平台表述建议

可以表述为：平台已导入 Kaggle 公开象热成像 YOLO 数据，并完成基于 YOLOv8n 的象类热目标识别训练；在当前验证集上 elephant 类 mAP50 达到 0.989。

需要谨慎表述：整体多类指标受 device/unknown 等小样本类别影响较大，不宜把整体 7 类指标包装成全部类别高精度。当前训练结果更适合支撑“象热目标识别模块原型”和“平台模型验证”，后续仍需要边境实地司空 2 数据进行迁移验证。

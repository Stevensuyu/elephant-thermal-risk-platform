# 多源真实热成像 YOLO 训练报告

## 已导入资料

1. `LibreYOLO/thermal-dogs-and-people-x6ejw`
   - 来源：Hugging Face / Roboflow Universe
   - 许可：CC BY 4.0
   - 原始类别：dog, person
   - 本地路径：`downloads/thermal-dogs-and-people-x6ejw`

2. `LibreYOLO/thermal-cheetah-my4dp`
   - 来源：Hugging Face / Roboflow Universe
   - 许可：CC BY 4.0
   - 原始类别：cheetah, human
   - 本地路径：`downloads/thermal-cheetah-my4dp`

3. `Elephant - Thermal Images`
   - 来源：Kaggle
   - 状态：已找到数据源，但本机 `kagglehub/kagglesdk` 导入仍存在版本冲突，未成功下载。
   - 后续处理：配置 Kaggle 下载环境后，可作为 `elephant` 类并入当前多源数据集。

## 统一后的数据结构

本轮将两个已下载数据集统一为：

`data/multisource_thermal_animals`

类别映射：

- `0`: dog
- `1`: person
- `2`: cheetah

数据量：

- train: 232 images
- valid: 66 images
- test: 34 images
- total: 332 images

YOLO 配置：

`data/multisource_thermal_animals.yaml`

## 训练命令

```bash
python prepare_multisource_thermal_yolo.py
python train_multisource_thermal_yolo.py
```

训练设置：

- Model: YOLOv8n
- Image size: 320
- Epochs: 20
- Batch: 4
- Device: CPU

## 验证指标

最终验证集整体指标：

- Precision: 0.951
- Recall: 0.840
- mAP50: 0.932
- mAP50-95: 0.714

按类别指标：

- dog: Precision 1.000, Recall 0.917, mAP50 0.989, mAP50-95 0.880
- person: Precision 0.915, Recall 0.833, mAP50 0.934, mAP50-95 0.657
- cheetah: Precision 0.937, Recall 0.769, mAP50 0.874, mAP50-95 0.606

## 输出文件

- 权重：`runs/detect/runs/multisource_thermal_animals/yolov8n_multisource_thermal_20e/weights/best.pt`
- 训练曲线：`runs/detect/runs/multisource_thermal_animals/yolov8n_multisource_thermal_20e/results.png`
- 混淆矩阵：`runs/detect/runs/multisource_thermal_animals/yolov8n_multisource_thermal_20e/confusion_matrix.png`
- 标签分布：`runs/detect/runs/multisource_thermal_animals/yolov8n_multisource_thermal_20e/labels.jpg`
- 推理样例：`runs/detect/runs/multisource_thermal_animals_predict/valid_predictions`

## 说明

本轮训练已经使用不同来源的真实热成像资料，完成多源导入、类别映射、统一 YOLO 数据集构建、训练、验证和推理样例输出。

当前模型仍不能被表述为“象群专用模型”，因为已成功下载的数据中尚未包含 elephant 类。平台中已保留 elephant 类扩展路线：后续只需导入 Kaggle 象热成像数据或现场标注的司空 2 热成像帧，即可把类别扩展为 `dog/person/cheetah/elephant` 或只保留 `elephant/person/vehicle` 等边境实战类别。

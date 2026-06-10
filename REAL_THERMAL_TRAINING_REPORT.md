# 真实热成像 YOLO 训练记录

## 数据来源

- 数据集：`LibreYOLO/thermal-dogs-and-people-x6ejw`
- 来源页：`https://huggingface.co/datasets/LibreYOLO/thermal-dogs-and-people-x6ejw`
- 原始 Roboflow 项目：`https://universe.roboflow.com/roboflow-100/thermal-dogs-and-people-x6ejw/dataset/1`
- 许可：CC BY 4.0
- 类别：`dog`, `person`
- 用途：真实热成像目标检测训练流程展示

说明：该数据集不是象群数据，因此不能宣称训练出了“象群识别模型”。本轮训练用于证明平台可以导入真实热成像图片、训练 YOLO 模型、输出训练曲线和预测结果。后续接入司空 2 热成像象群帧后，可复用同一训练流程。

## 数据规模

- Train：142 张图片
- Valid：41 张图片
- Test：20 张图片
- YOLO 标注：已随数据集提供

## 训练配置

- 框架：Ultralytics YOLO
- 模型：`yolov8n.pt`
- 输入尺寸：320
- Epochs：5
- Batch：4
- 设备：CPU
- 脚本：`train_real_thermal_yolo.py`

## 训练结果

最后验证结果：

- Precision：0.78552
- Recall：0.74242
- mAP50：0.80227
- mAP50-95：0.59844

输出目录：

- 权重：`runs/detect/runs/real_thermal_dogs_people/yolov8n_real_thermal/weights/best.pt`
- 训练曲线：`runs/detect/runs/real_thermal_dogs_people/yolov8n_real_thermal/results.png`
- 混淆矩阵：`runs/detect/runs/real_thermal_dogs_people/yolov8n_real_thermal/confusion_matrix.png`
- 标签分布：`runs/detect/runs/real_thermal_dogs_people/yolov8n_real_thermal/labels.jpg`
- 预测样例：`runs/detect/runs/real_thermal_dogs_people_predict/valid_predictions`


把需要参与训练的视频放到这个文件夹。
支持格式：mp4、mov、avi、mkv、webm、m4v。

放入视频后，在项目根目录运行：
python scripts\video_to_yolo_dataset.py --input user_materials\videos --clean
python prepare_elephant_multisource_thermal_yolo.py
python train_elephant_yolo.py --data data\elephant_multisource_thermal.yaml --epochs 30 --imgsz 640 --batch 16 --device auto --predict --zip

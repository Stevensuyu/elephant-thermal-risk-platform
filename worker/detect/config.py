# -*- coding: utf-8 -*-
"""检测服务配置：端口、默认源、默认引擎、GPU 等。"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class ServiceConfig:
    host: str = "127.0.0.1"
    port: int = 8765

    # ---- 视频源默认值 ----
    default_source_type: str = "webcam"          # webcam | stream | drone | file
    default_webcam_index: int = 0

    # ---- 检测引擎默认值 ----
    default_engine: str = "yolo"                  # 主引擎：yolo（实时逐帧）
    yolo_model: str = "yolo11n.pt"               # ultralytics 最新版模型（首次运行自动下载）
    yolo_imgsz: int = 640
    yolo_conf: float = 0.5
    # 若存在已训练的象群模型（runs/detect/.../best.pt）则优先使用，平台训练产物自动衔接
    yolo_trained_weights: str = os.environ.get(
        "DETECT_YOLO_WEIGHTS",
        "runs/detect/runs/elephant_multisource_thermal/yolov8n_elephant_multisource_8e/weights/best.pt",
    )

    # ---- 管线 ----
    jpeg_quality: int = 70                       # MJPEG 质量
    max_stream_fps: float = 15.0                 # 推流上限
    target_fps: float = 8.0                      # 检测目标帧率
    draw_labels: bool = True
    gpu: str = "auto"                            # auto | cpu | 0  (0=首块N卡)

    def resolve_device(self) -> str:
        if self.gpu != "auto":
            return self.gpu
        try:
            import torch
            if torch.cuda.is_available():
                return "0"
        except Exception:
            pass
        return "cpu"

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"


def load_config() -> ServiceConfig:
    cfg = ServiceConfig()
    cfg.port = int(os.environ.get("DETECT_PORT", cfg.port))
    cfg.yolo_model = os.environ.get("DETECT_YOLO_MODEL", cfg.yolo_model)
    cfg.default_engine = os.environ.get("DETECT_ENGINE", cfg.default_engine)
    return cfg

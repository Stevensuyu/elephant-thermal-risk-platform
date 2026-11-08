# -*- coding: utf-8 -*-
"""Ultralytics YOLO 检测引擎（最新版 ultralytics + YOLO11 等模型，GPU/CPU 自适应）。"""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np

from .base import Detection, DetectionEngine, EngineInfo, EngineError, register_engine


@register_engine("yolo")
class YoloEngine(DetectionEngine):
    engine_id = "yolo"

    def __init__(self, model: str = "yolo11n.pt", imgsz: int = 640, conf: float = 0.25,
                 device: str = "auto", labels: list[str] | None = None, **params):
        super().__init__(model=model, imgsz=imgsz, conf=conf, device=device, labels=labels or [])
        self.model_path = model
        self.imgsz = int(imgsz)
        self.conf = float(conf)
        self.device = device
        self.keep_labels: list[str] = labels or []     # 为空则输出全部类别；可限定只关注 elephant 等
        self._model = None
        self._names: list[str] = []

    def _resolve_weights(self) -> str:
        # 若指定模型不存在且项目里已有训练产物 best.pt，则回退到它
        if self.model_path and Path(self.model_path).exists():
            return self.model_path
        trained_raw = (self.params.get("trained_weights") or "").strip()
        if trained_raw:
            trained = Path(trained_raw)
            if trained.exists() and trained.is_file():
                return str(trained)
        return self.model_path   # ultralytics 会自动下载 yolo11n.pt 等官方权重

    def load(self) -> EngineInfo:
        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise EngineError("未安装 ultralytics，请先运行: .venv\\Scripts\\pip install -r worker/requirements.txt") from exc

        try:
            self._model = YOLO(self._resolve_weights())
            self._names = list(self._model.names.values()) if hasattr(self._model, "names") else []
            self._loaded = True
            self._error = None
        except Exception as exc:
            self._error = str(exc)
            raise EngineError(f"YOLO 模型加载失败: {exc}") from exc

        device = self.device
        if device == "auto":
            try:
                import torch
                device = "0" if torch.cuda.is_available() else "cpu"
            except Exception:
                device = "cpu"
        self.device = device
        return EngineInfo(id=self.engine_id, name="Ultralytics YOLO（最新版）",
                          description=f"模型 {Path(self.model_path).name} · 分辨率 {self.imgsz}",
                          available=True, device=device, loaded=True)

    def detect(self, frame_bgr: np.ndarray) -> list[Detection]:
        if self._model is None:
            raise EngineError("YOLO 引擎未加载")
        results = self._model.predict(frame_bgr, imgsz=self.imgsz, conf=self.conf,
                                      device=self.device, verbose=False)
        detections: list[Detection] = []
        if not results:
            return detections
        r = results[0]
        boxes = getattr(r, "boxes", None)
        if boxes is None:
            return detections
        xyxy = boxes.xyxy.cpu().numpy() if hasattr(boxes.xyxy, "cpu") else boxes.xyxy
        confs = boxes.conf.cpu().numpy() if hasattr(boxes.conf, "cpu") else boxes.conf
        clss = boxes.cls.cpu().numpy() if hasattr(boxes.cls, "cpu") else boxes.cls
        names = self._model.names if hasattr(self._model, "names") else {}
        for x1, y1, x2, y2, c, ci in zip(xyxy[:, 0], xyxy[:, 1], xyxy[:, 2], xyxy[:, 3], confs, clss):
            label = str(names.get(int(ci), f"class{int(ci)}"))
            if self.keep_labels and label not in self.keep_labels:
                continue
            detections.append(Detection(
                label=label,
                confidence=float(c),
                bbox=(int(x1), int(y1), int(x2), int(y2)),
                engine="yolo",
            ))
        return detections

    def info(self) -> EngineInfo:
        return EngineInfo(id=self.engine_id, name="Ultralytics YOLO（最新版）",
                          description=f"模型 {Path(self.model_path).name}",
                          available=True, loaded=self._loaded, error=self._error,
                          device=self.device)

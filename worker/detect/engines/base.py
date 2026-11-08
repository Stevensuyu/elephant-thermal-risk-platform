# -*- coding: utf-8 -*-
"""
检测引擎抽象层：所有检测模型（YOLO / 英伟达 LocateAnything-3B / 未来新增）实现同一接口。
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np


@dataclass
class Detection:
    """单条检测结果。bbox 为绝对像素坐标 (x1, y1, x2, y2)。"""
    label: str
    confidence: float
    bbox: tuple[int, int, int, int]
    engine: str = "yolo"
    extra: dict = field(default_factory=dict)

    @property
    def bbox_norm(self) -> tuple[float, float, float, float]:
        """归一化 (x, y, w, h)，供前端叠加与判警引擎使用（需传入画面宽高）。"""
        return self.bbox  # 占位，实际由 to_bbox_norm(w, h) 计算


def to_bbox_norm(det: Detection, w: int, h: int) -> list[float]:
    x1, y1, x2, y2 = det.bbox
    return [
        round(x1 / w, 4), round(y1 / h, 4),
        round((x2 - x1) / w, 4), round((y2 - y1) / h, 4),
    ]


@dataclass
class EngineInfo:
    """引擎描述（供前端展示与状态页）。"""
    id: str
    name: str
    description: str = ""
    available: bool = True
    device: str = ""
    error: Optional[str] = None
    loaded: bool = False


class DetectionEngine(ABC):
    """检测引擎基类。detect() 可被管线线程重复调用，必须线程安全（只读模型）。"""

    engine_id: str = "base"

    def __init__(self, **params: Any) -> None:
        self.params = params
        self._loaded = False
        self._error: Optional[str] = None

    # ---- 生命周期 ----
    @abstractmethod
    def load(self) -> EngineInfo:
        """加载模型（首次调用较慢）。失败抛 EngineError 并记录 error。"""

    @abstractmethod
    def detect(self, frame_bgr: np.ndarray) -> list[Detection]:
        """对一帧 BGR 图像执行检测，返回 Detection 列表。"""

    def unload(self) -> None:
        self._loaded = False

    def info(self) -> EngineInfo:
        return EngineInfo(id=self.engine_id, name=self.engine_id, available=True,
                          loaded=self._loaded, error=self._error)


class EngineError(RuntimeError):
    """检测引擎加载/推理失败。"""


def register_engine(eid: str):
    def deco(cls: type[DetectionEngine]):
        ENGINE_REGISTRY[eid] = cls
        cls.engine_id = eid
        return cls
    return deco


ENGINE_REGISTRY: dict[str, type[DetectionEngine]] = {}


def create_engine(eid: str, **params: Any) -> DetectionEngine:
    if eid not in ENGINE_REGISTRY:
        raise EngineError(f"未注册的检测引擎: {eid}，可用: {list(ENGINE_REGISTRY)}")
    return ENGINE_REGISTRY[eid](**params)


def list_engine_ids() -> list[str]:
    return list(ENGINE_REGISTRY)

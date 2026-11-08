# -*- coding: utf-8 -*-
"""
视频源抽象层：所有相机 / 网络流 / 无人机图传 / 本地文件 都实现同一个接口，
上层 Pipeline 只依赖 VideoSource，不关心具体来源。
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np


@dataclass
class SourceInfo:
    """视频源的对外描述（供前端展示与选择）。"""
    type: str                    # webcam | stream | drone | file
    label: str                   # 人类可读名称
    params: dict = field(default_factory=dict)   # 展示用参数（index / url / path 等）
    width: int = 0
    height: int = 0
    fps: float = 0.0
    connected: bool = False
    error: Optional[str] = None


class VideoSource(ABC):
    """视频源基类。线程模型：open() 在管线线程内调用；read() 阻塞返回一帧。"""

    kind: str = "base"

    def __init__(self, **params: Any) -> None:
        self.params = params
        self._opened = False

    # ---- 生命周期 ----
    @abstractmethod
    def open(self) -> SourceInfo:
        """打开视频源；失败时抛 VideoSourceError。"""

    @abstractmethod
    def read(self) -> Optional[np.ndarray]:
        """读取一帧 BGR 图像；结束或出错返回 None。"""

    def release(self) -> None:
        self._opened = False

    # ---- 查询 ----
    @abstractmethod
    def info(self) -> SourceInfo:
        """返回当前源的描述（含分辨率）。"""

    def describe(self) -> dict:
        return self.info().__dict__


class VideoSourceError(RuntimeError):
    """视频源打开/读取失败。"""


def register_source(kind: str):
    """装饰器：把 VideoSource 子类注册到 kind -> class 映射。"""
    def deco(cls: type[VideoSource]):
        SOURCE_REGISTRY[kind] = cls
        cls.kind = kind
        return cls
    return deco


SOURCE_REGISTRY: dict[str, type[VideoSource]] = {}


def create_source(kind: str, **params: Any) -> VideoSource:
    if kind not in SOURCE_REGISTRY:
        raise VideoSourceError(f"未注册的视频源类型: {kind}，可用: {list(SOURCE_REGISTRY)}")
    return SOURCE_REGISTRY[kind](**params)


def list_source_kinds() -> list[dict]:
    return [{"type": k, "label": getattr(cls, "display_name", k)} for k, cls in SOURCE_REGISTRY.items()]

# -*- coding: utf-8 -*-
"""本地视频/图片文件源（MP4 / 监控回放 / JPG 测试图），用于离线检测与算法调试。

视频走 ffmpeg；图片（jpg/png/bmp/webp 等）走 cv2.imread 单帧循环，避免 ffmpeg 打开图片卡死。
"""
from __future__ import annotations

import os
import time
from typing import Optional

import cv2
import numpy as np

from .base import SourceInfo, VideoSourceError, register_source
from .stream_source import StreamSource

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}


@register_source("file")
class FileSource(StreamSource):
    display_name = "本地视频/图片文件"

    def __init__(self, path: str = "", **params):
        super().__init__(url=path, protocol="FILE", **params)
        self.path = path
        self._frame: Optional[np.ndarray] = None
        self._is_image = bool(path) and os.path.splitext(path)[1].lower() in _IMAGE_EXTS
        self._info = SourceInfo(type="file", label="本地文件", params={"path": path})

    def open(self) -> SourceInfo:
        if not self.path or not os.path.isfile(self.path):
            raise VideoSourceError("文件不存在: %s" % (self.path or "空路径"))
        if self._is_image:
            frame = cv2.imread(self.path)
            if frame is None:
                raise VideoSourceError("无法读取图片: %s" % self.path)
            self._frame = frame
            self._opened = True
            self._info = SourceInfo(
                type="file", label=os.path.basename(self.path),
                params={"path": self.path, "kind": "image"},
                width=frame.shape[1], height=frame.shape[0], fps=0.0,
                connected=True,
            )
            return self._info
        # 视频走 ffmpeg
        return super().open()

    def read(self) -> Optional[np.ndarray]:
        if self._is_image:
            return self._frame  # 图片循环输出同一帧
        return super().read()

    def info(self) -> SourceInfo:
        if self._is_image and self._opened:
            return self._info
        info = super().info()
        info.label = self.path.split("\\")[-1].split("/")[-1]
        return info

    def release(self) -> None:
        self._frame = None
        super().release()

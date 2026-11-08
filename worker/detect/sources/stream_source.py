# -*- coding: utf-8 -*-
"""网络流视频源：RTSP / RTMP / HLS / HTTP（IPC 摄像头、监控球机、大疆司空直播推流）。

pip 版 opencv-python 自带 ffmpeg 为精简构建，不含网络协议模块（HTTP/RTSP/RTMP 打不开）。
本实现改用完整 ffmpeg（imageio-ffmpeg 自带，含全部网络协议）子进程解码：
    ffmpeg -i <url> -f rawvideo -pix_fmt bgr24 -an -sn pipe:1
Python 从 stdout 管道按帧尺寸读取 BGR 帧，彻底解决网络流读取问题。
VOD 文件播完自动循环（重启 ffmpeg 进程），实时流断线自动重连。

RTMP 直播推流（大疆司空 2 / DJI FlightHub 2 / 遥控器直播）专用参数：
    -fflags +genpts -rw_timeout 15000000 -analyzeduration 8000000 -probesize 8000000
"""
from __future__ import annotations

import os
import subprocess
import threading
import time
from typing import Optional

import cv2
import numpy as np

from .base import VideoSource, VideoSourceError, SourceInfo, register_source

try:
    import imageio_ffmpeg
    _FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:  # pragma: no cover
    _FFMPEG = "ffmpeg"

_MAX_WIDTH = 1920  # 解码上限，防止异常流占用过高带宽
_DEFAULT_W = 1280
_DEFAULT_H = 720
_DEFAULT_FPS = 25.0


def _ffprobe_stream(url: str, timeout: int = 12) -> tuple[int, int, float]:
    """用 ffmpeg 自带的 ffprobe 探测流的分辨率和帧率。
    返回 (width, height, fps)；失败返回 (0, 0, 0.0)。
    """
    try:
        # imageio-ffmpeg 只提供 ffmpeg，ffprobe 可能在同目录
        ffprobe = _FFMPEG.replace("ffmpeg", "ffprobe")
        if not os.path.exists(ffprobe):
            # 尝试系统 ffprobe
            ffprobe = "ffprobe"
        cmd = [
            ffprobe, "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,avg_frame_rate",
            "-of", "csv=p=0",
            url,
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
        )
        if result.returncode == 0 and result.stdout.strip():
            parts = result.stdout.strip().split(",")
            w = int(parts[0]) if len(parts) > 0 and parts[0].isdigit() else 0
            h = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
            fps = _DEFAULT_FPS
            if len(parts) > 2 and "/" in parts[2]:
                num, den = parts[2].split("/")
                if float(den) > 0:
                    fps = float(num) / float(den)
            if w > 0 and h > 0:
                return w, h, fps
    except Exception:
        pass
    return 0, 0, 0.0


@register_source("stream")
class StreamSource(VideoSource):
    display_name = "网络摄像头 / 视频流（RTSP/RTMP/HLS/HTTP）"

    def __init__(self, url: str = "", protocol: str = "RTSP", **params):
        super().__init__(url=url, protocol=protocol, **params)
        self.url = url
        self.protocol = (protocol or "RTSP").upper()
        self._proc: Optional[subprocess.Popen] = None
        self._w = 0
        self._h = 0
        self._fps = 0.0
        self._frame_bytes = 0
        self._info = SourceInfo(type="stream", label=self.protocol, params={"url": url, "protocol": self.protocol})

    # ---- 打开 ----
    def open(self) -> SourceInfo:
        if not self.url:
            raise VideoSourceError("网络流地址为空")
        self._start_ffmpeg()
        self._opened = True
        self._info.label = f"{self.protocol} 直播流"
        info = self.info()
        info.connected = True
        return info

    def _is_rtmp(self) -> bool:
        return self.url.lower().startswith("rtmp://") or self.protocol == "RTMP"

    def _start_ffmpeg(self) -> None:
        # 用 ffprobe 探测分辨率/帧率（完整 ffmpeg 支持网络协议）
        w, h, fps = _ffprobe_stream(self.url)
        if not w or not h:
            # ffprobe 不可用或探测失败，用默认值（RTMP 直播常见 1280x720）
            w, h, fps = _DEFAULT_W, _DEFAULT_H, _DEFAULT_FPS
        if w > _MAX_WIDTH:
            scale = _MAX_WIDTH / w
            w, h = _MAX_WIDTH, int(h * scale / 2) * 2
        self._w, self._h, self._fps = w, h, fps or _DEFAULT_FPS
        self._frame_bytes = w * h * 3

        # 基础 ffmpeg 命令
        cmd = [
            _FFMPEG, "-hide_banner", "-loglevel", "error",
        ]

        # RTMP 直播推流专用参数（大疆司空 2 / DJI FlightHub 2 / 遥控器直播）
        if self._is_rtmp():
            cmd += [
                "-fflags", "+genpts",
                "-rw_timeout", "15000000",   # 读超时 15 秒
                "-analyzeduration", "8000000", # 分析时长 8 秒
                "-probesize", "8000000",       # 探测大小 8MB
                "-live_start_index", "0",
            ]
        else:
            # RTSP/HLS 通用参数
            cmd += [
                "-rw_timeout", "10000000",
                "-analyzeduration", "5000000",
                "-probesize", "5000000",
            ]

        cmd += [
            "-i", self.url,
            "-f", "rawvideo", "-pix_fmt", "bgr24", "-an", "-sn",
            "-vf", f"scale={w}:{h}",
            "pipe:1",
        ]

        try:
            self._proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0,
            )
        except Exception as exc:
            raise VideoSourceError(f"ffmpeg 启动失败: {exc}") from exc

    # ---- 读帧 ----
    def read(self) -> Optional[np.ndarray]:
        if self._proc is None or self._proc.stdout is None:
            return None
        data = bytearray()
        try:
            while len(data) < self._frame_bytes:
                chunk = self._proc.stdout.read(self._frame_bytes - len(data))
                if not chunk:
                    break
                data.extend(chunk)
        except Exception:
            return None
        if len(data) < self._frame_bytes:
            # 流结束（VOD 播完 / 断线）→ 自动循环或重连
            self._restart()
            return None if not self._opened else self.read()
        frame = np.frombuffer(bytes(data), dtype=np.uint8).reshape(self._h, self._w, 3)
        return np.ascontiguousarray(frame)

    def _restart(self) -> None:
        self._kill_proc()
        if not self._opened:
            return
        try:
            self._start_ffmpeg()
        except Exception:
            self._opened = False

    def _kill_proc(self) -> None:
        if self._proc is not None:
            try:
                if self._proc.poll() is None:
                    self._proc.kill()
                self._proc.wait(timeout=3)
            except Exception:
                pass
            self._proc = None

    def release(self) -> None:
        self._opened = False
        self._kill_proc()

    def info(self) -> SourceInfo:
        self._info.width = self._w
        self._info.height = self._h
        self._info.fps = self._fps
        self._info.connected = self._opened
        return self._info

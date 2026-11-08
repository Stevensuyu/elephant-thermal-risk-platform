# -*- coding: utf-8 -*-
"""
无人机图传视频源。

支持两类接入：
1. RTMP 图传地址（DJI 司空 / 机场 / 遥控器图传推流，格式 rtmp://...）
2. MAVLink UDP 图传端口（udp://ip:port，常见地面站图传）

统一以 OpenCV 解流，未来接新机型只需补充 URL 模板即可。
"""
from __future__ import annotations

from .stream_source import StreamSource
from .base import SourceInfo, register_source


@register_source("drone")
class DroneSource(StreamSource):
    display_name = "无人机图传（DJI RTMP / MAVLink）"

    def __init__(self, url: str = "", protocol: str = "RTMP", drone_id: str = "", **params):
        super().__init__(url=url, protocol=protocol or "RTMP", **params)
        self.drone_id = drone_id
        self._info = SourceInfo(
            type="drone",
            label=f"无人机 {drone_id or '-'} 图传",
            params={"url": url, "protocol": protocol or "RTMP", "drone_id": drone_id},
        )

    def open(self) -> SourceInfo:
        if not self.url:
            # 提供 DJI 图传的常用默认地址提示，但不伪造可用地址
            raise VideoSourceError("无人机图传地址为空（DJI 司空图传通常为 rtmp://…，MAVLink 图传为 udp://ip:port）")
        return super().open()

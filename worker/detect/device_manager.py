# -*- coding: utf-8 -*-
"""
设备管理器：持久化存储已添加的相机/视频源设备，支持 CRUD。

设备类型：
  - webcam : 本机 USB 摄像头 / HDMI 采集卡（如 DJI Osmo Pocket 3、索尼相机 HDMI 采集）
  - stream : 网络流（RTSP / RTMP / HLS / HTTP-FLV，如海康/大华/大疆无人机图传）
  - drone  : 无人机（DJI 系列 / 通用 UDP 图传）
  - file   : 本地视频文件 / 图片（测试用）

设备配置持久化到 worker/detect/devices.json，服务重启后自动恢复。
"""
from __future__ import annotations

import json
import threading
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class Device:
    id: str                              # 唯一 ID（自动生成）
    name: str                            # 设备名称（用户自定义，如"Pocket 3"、"索尼 A7M4"）
    type: str                            # webcam | stream | drone | file
    params: dict = field(default_factory=dict)  # 源参数（index/url/path 等）
    enabled: bool = True                 # 是否启用
    note: str = ""                       # 备注

    def to_dict(self) -> dict:
        return asdict(self)


class DeviceManager:
    def __init__(self, storage_path: Path):
        self.storage_path = Path(storage_path)
        self._lock = threading.Lock()
        self._devices: dict[str, Device] = {}
        self._load()

    # ---------- 持久化 ----------

    def _load(self) -> None:
        if not self.storage_path.exists():
            return
        try:
            raw = json.loads(self.storage_path.read_text(encoding="utf-8"))
            for item in raw.get("devices", []):
                dev = Device(**item)
                self._devices[dev.id] = dev
        except Exception:
            pass

    def _save(self) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        data = {"devices": [d.to_dict() for d in self._devices.values()]}
        self.storage_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    # ---------- CRUD ----------

    def list_devices(self) -> list[Device]:
        with self._lock:
            return list(self._devices.values())

    def get_device(self, device_id: str) -> Optional[Device]:
        with self._lock:
            return self._devices.get(device_id)

    def add_device(self, name: str, type: str, params: dict,
                   enabled: bool = True, note: str = "") -> Device:
        with self._lock:
            dev = Device(
                id=uuid.uuid4().hex[:12],
                name=name.strip() or f"{type}-{len(self._devices)+1}",
                type=type,
                params=params or {},
                enabled=enabled,
                note=note,
            )
            self._devices[dev.id] = dev
            self._save()
            return dev

    def remove_device(self, device_id: str) -> bool:
        with self._lock:
            if device_id in self._devices:
                del self._devices[device_id]
                self._save()
                return True
            return False

    def update_device(self, device_id: str, **patch) -> Optional[Device]:
        with self._lock:
            dev = self._devices.get(device_id)
            if dev is None:
                return None
            for k, v in patch.items():
                if hasattr(dev, k) and k != "id":
                    setattr(dev, k, v)
            self._save()
            return dev

    # ---------- 设备预设（快速添加常见相机） ----------

    PRESETS = {
        "dji_pocket3": {
            "name": "DJI Osmo Pocket 3",
            "type": "webcam",
            "params": {"index": 0, "width": 640, "height": 480},
            "note": "USB 直连 UVC 相机；backend 自动探测（DSHOW/MSMF），HDMI 输出需采集卡",
        },
        "sony_hdmi": {
            "name": "索尼相机（HDMI 采集）",
            "type": "webcam",
            "params": {"index": 1, "width": 640, "height": 480},
            "note": "索尼 A7/ZV/E 系列通过 HDMI 采集卡接入，采集卡显示为 UVC 摄像头",
        },
        "hikvision_rtsp": {
            "name": "海康威视（RTSP）",
            "type": "stream",
            "params": {"url": "", "protocol": "RTSP"},
            "note": "RTSP 主码流，输入实际 RTSP 地址（如 rtsp://admin:password@IP:554/...）",
        },
        "dahua_rtsp": {
            "name": "大华（RTSP）",
            "type": "stream",
            "params": {"url": "", "protocol": "RTSP"},
            "note": "RTSP 主码流，输入实际 RTSP 地址（如 rtsp://admin:password@IP:554/...）",
        },
        "dji_drone": {
            "name": "大疆无人机图传（RTMP 直播）",
            "type": "drone",
            "params": {"url": "", "protocol": "RTMP", "model": "dji_generic"},
            "note": "DJI 无人机 RTMP 直播推流（Mavic 3 / Air 3 / Mini 4 Pro 遥控器直播），输入实际 RTMP 地址",
        },
        "dji_drone_flighthub": {
            "name": "大疆司空 2 直播（FlightHub 2 RTMP）",
            "type": "drone",
            "params": {"url": "", "protocol": "RTMP", "model": "dji_flighthub2"},
            "note": "大疆司空 2（DJI FlightHub 2）云端直播，输入司空 2 控制台获取的 RTMP 直播地址",
        },
        "dji_drone_dock": {
            "name": "大疆机场直播（Dock RTMP）",
            "type": "drone",
            "params": {"url": "", "protocol": "RTMP", "model": "dji_dock"},
            "note": "大疆机场（DJI Dock）现场直播，输入机场实际 RTMP 推流地址",
        },
        "generic_rtsp": {
            "name": "通用 RTSP 相机",
            "type": "stream",
            "params": {"url": "", "protocol": "RTSP"},
            "note": "任意支持 RTSP 的网络相机/编码器/NVR，输入实际 RTSP 地址",
        },
        "usb_webcam": {
            "name": "USB 摄像头",
            "type": "webcam",
            "params": {"index": 0, "width": 640, "height": 480},
            "note": "普通 USB 摄像头 / 笔记本内置摄像头；backend 自动探测",
        },
    }

    def add_from_preset(self, preset_key: str, overrides: Optional[dict] = None) -> Optional[Device]:
        preset = self.PRESETS.get(preset_key)
        if preset is None:
            return None
        params = dict(preset["params"])
        if overrides:
            params.update(overrides.get("params", {}))
        return self.add_device(
            name=overrides.get("name", preset["name"]) if overrides else preset["name"],
            type=preset["type"],
            params=params,
            note=preset["note"],
        )

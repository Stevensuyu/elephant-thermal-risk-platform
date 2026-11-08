# -*- coding: utf-8 -*-
"""本机摄像头 / USB 外置相机（含 DJI Osmo Pocket 3 等 UVC 相机）视频源。

稳定性要点（针对 Pocket 3 在 Windows 11 上频繁打不开的问题）：
  1. 不再硬编码 CAP_DSHOW，改为按 [CAP_DSHOW, CAP_MSMF, 默认] 依次尝试，
     记录最终可用的 backend；Pocket 3 / UVC 相机在不同 Windows 版本上
     需要的 backend 不一致，DSHOW 在 Win11 上经常对 UVC 设备返回黑帧或打不开。
  2. 探测/打开分辨率统一为 640x480，避免 enumerate 与 open 参数不一致导致
     enumerate 显示可用、open 失败的诡异现象。
  3. 打开失败时给出明确错误信息（含尝试过的 backend 列表），方便排障。
"""
from __future__ import annotations

import logging
from typing import Optional

import cv2
import numpy as np

from .base import VideoSource, VideoSourceError, SourceInfo, register_source

logger = logging.getLogger("detect.webcam")

# Windows 上对 UVC 相机按序尝试的 OpenCV backend。
# 注意 cv2.CAP_ANY == 0，会触发 OpenCV 自动选择，作为最后兜底。
_WIN_BACKENDS = [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]
_BACKEND_NAMES = {
    int(cv2.CAP_DSHOW): "DSHOW",
    int(cv2.CAP_MSMF): "MSMF",
    int(cv2.CAP_ANY): "ANY",
}

# 统一探测/打开分辨率（小分辨率优先保稳定，降低内存压力）
_PROBE_W = 640
_PROBE_H = 480

# 黑帧检测：连续 _BLACK_FRAME_PROBE_COUNT 帧，帧均值都低于此值即视为「能打开但全是黑帧」
# 这是 Win11 上 DSHOW 打开 Pocket 3 时的典型表现——isOpened=True、read() 也成功，但内容全黑
# 此时必须自动 fallback 到下一个 backend（如 MSMF）
_BLACK_FRAME_MEAN_THRESHOLD = 25.0
_BLACK_FRAME_PROBE_COUNT = 3


def _backend_label(b: int) -> str:
    return _BACKEND_NAMES.get(int(b), str(b))


def _is_black_frame(frame, mean_threshold: float = _BLACK_FRAME_MEAN_THRESHOLD) -> bool:
    """判断单帧是否为「全黑 / 极暗」帧（基本无可视内容）。"""
    try:
        if frame is None or frame.size == 0:
            return True
        return float(frame.mean()) < mean_threshold
    except Exception:
        # frame.mean() 在异常帧上可能抛 cv2.error，视为黑帧
        return True


def _safe_set(cap: cv2.VideoCapture, prop: int, value: float) -> None:
    """cap.set 在设备状态异常/被占用时会抛 cv2.error（Unknown C++ exception），
    这里必须吞掉，否则会把整个枚举/打开流程甚至服务进程搞崩。"""
    try:
        cap.set(prop, value)
    except Exception:
        pass


def _safe_read(cap: cv2.VideoCapture):
    """安全读帧：任何 OpenCV 异常都返回 None，不让调用方崩溃。"""
    try:
        ok, frame = cap.read()
        if not ok or frame is None:
            return None
        return frame
    except Exception:
        return None


def _safe_release(cap) -> None:
    try:
        if cap is not None:
            cap.release()
    except Exception:
        pass


def _try_open(index: int, backend: int, *, do_read: bool = False,
              require_non_black: bool = False) -> Optional[cv2.VideoCapture]:
    """尝试用指定 backend 打开摄像头。

    - do_read=True 时再尝试 read 一次确认能取出帧
    - require_non_black=True 时连续读多帧验证内容不是黑帧（DSHOW 假打开的常见场景）

    全程异常保护：OpenCV 在设备被占用/拔插瞬间会抛 cv2.error（C++ 异常），
    任何一步异常都视为「该 backend 不可用」，返回 None 而不是向上抛。
    """
    cap = None
    try:
        cap = cv2.VideoCapture(index, backend)
        if not cap.isOpened():
            _safe_release(cap)
            return None
        if not do_read:
            return cap
        frame = _safe_read(cap)
        if frame is None:
            _safe_release(cap)
            return None
        if require_non_black:
            # 连续读 _BLACK_FRAME_PROBE_COUNT 帧，全部都是黑帧才拒绝
            _safe_set(cap, cv2.CAP_PROP_FRAME_WIDTH, _PROBE_W)
            _safe_set(cap, cv2.CAP_PROP_FRAME_HEIGHT, _PROBE_H)
            for _ in range(_BLACK_FRAME_PROBE_COUNT):
                frame = _safe_read(cap)
                if frame is None:
                    continue
                if not _is_black_frame(frame):
                    return cap  # 拿到非黑帧 → 验证通过，直接返回（不能 release！）
            # 连续多帧都是黑帧，认为该 backend 不可用
            _safe_release(cap)
            return None
        return cap
    except Exception as exc:
        logger.warning(f"打开摄像头 {index} backend={_backend_label(backend)} 异常(已忽略): {exc}")
        _safe_release(cap)
        return None


@register_source("webcam")
class WebcamSource(VideoSource):
    display_name = "本机摄像头 / USB 相机"

    def __init__(self, index: int = 0, backend: Optional[str] = None, **params):
        super().__init__(index=index, backend=backend, **params)
        self.index = int(index)
        # 允许设备预设指定 backend（如 "dshow"/"msmf"）；不指定则自动探测
        self._preferred_backend = self._parse_backend(backend)
        self._cap: Optional[cv2.VideoCapture] = None
        self._used_backend: Optional[int] = None
        self._info = SourceInfo(
            type="webcam",
            label=f"摄像头 {self.index}",
            params={"index": self.index},
        )

    @staticmethod
    def _parse_backend(backend) -> Optional[int]:
        if backend is None:
            return None
        b = str(backend).strip().lower()
        if b in ("dshow", "directshow"):
            return cv2.CAP_DSHOW
        if b in ("msmf", "mediafoundation"):
            return cv2.CAP_MSMF
        if b in ("any", "auto", ""):
            return None
        return None  # 未知值交给自动探测

    def open(self) -> SourceInfo:
        """按 backend 优先级尝试打开，第一个能取出非黑帧的 backend 就用。

        黑帧 fallback：DSHOW 在 Win11 上对 DJI Pocket 3 等 UVC 设备经常能
        isOpened() 但持续输出黑帧（无图像内容）。这种情况必须自动跳到下一个
        backend（MSMF / ANY）重试，避免用户看到「连接成功但画面全黑」。

        重连场景（_opened 已为 True）：强制清掉 _preferred_backend，让所有
        backend 重新竞争；否则 reopen 还会硬选上次失败的那个 backend。
        """
        # reopen：清掉 backend 偏好，强制多 backend 重选
        if self._opened:
            self._preferred_backend = None
            if self._cap is not None:
                try:
                    self._cap.release()
                except Exception:
                    pass
                self._cap = None

        tried: list[str] = []
        backends = [self._preferred_backend] if self._preferred_backend is not None else list(_WIN_BACKENDS)
        backends = [b for b in backends if b is not None]

        cap = None
        used_backend = None
        last_reason = ""
        for b in backends:
            label = _backend_label(b)
            tried.append(label)
            cap = _try_open(self.index, b, do_read=True, require_non_black=True)
            if cap is not None:
                used_backend = b
                logger.info(f"摄像头 {self.index} backend={label} 验证通过（已读到非黑帧）")
                break
            last_reason = "黑帧或无法读出有效图像"

        if cap is None:
            # 最后再尝试一次：忽略 require_non_black，单纯验证能否打开 + 读出帧
            # 这样能给用户提供更明确的诊断（backend 能打开但内容是黑帧 = 设备/模式问题）
            cap = _try_open(self.index, backends[0] if backends else cv2.CAP_ANY,
                            do_read=True, require_non_black=False)
            if cap is not None:
                _safe_release(cap)
                raise VideoSourceError(
                    f"摄像头 {self.index} 能被系统识别，但所有 backend "
                    f"({', '.join(tried)}) 读出的都是黑帧（{last_reason}）。\n"
                    f"最常见原因：DJI Osmo Pocket 3 / 手机类 UVC 相机未切换到 "
                    f"「Webcam 模式」——请在 Pocket 3 屏幕下拉菜单中选「Webcam」后重试；"
                    f"或确认设备已解锁、未被其他程序（如 DJI Mimo）独占占用。"
                )
            raise VideoSourceError(
                f"无法打开摄像头 {self.index}（尝试 backend: {', '.join(tried)}）。"
                f"请确认设备已连接、未被其他程序（如 DJI Mimo、OBS）占用。"
            )

        # 统一设置小分辨率（_safe_set：设备异常时 cap.set 会抛 cv2.error，必须吞掉）
        _safe_set(cap, cv2.CAP_PROP_FRAME_WIDTH, _PROBE_W)
        _safe_set(cap, cv2.CAP_PROP_FRAME_HEIGHT, _PROBE_H)
        self._cap = cap
        self._used_backend = used_backend
        self._opened = True

        info = self.info()
        info.connected = True
        # 在 label 上体现 backend，方便排障
        info.label = f"摄像头 {self.index} · {_backend_label(used_backend)}"
        info.params = {
            "index": self.index,
            "backend": _backend_label(used_backend),
        }
        logger.info(
            f"摄像头 {self.index} 打开成功 backend={_backend_label(used_backend)} "
            f"{info.width}x{info.height}@{info.fps:.1f}fps"
        )
        return info

    def read(self) -> Optional[np.ndarray]:
        if self._cap is None:
            return None
        try:
            ok, frame = self._cap.read()
            if not ok or frame is None:
                return None
            # 强制 resize 到统一尺寸（部分摄像头 set() 不生效，手动 resize 确保）
            if frame.shape[1] != _PROBE_W or frame.shape[0] != _PROBE_H:
                frame = cv2.resize(frame, (_PROBE_W, _PROBE_H), interpolation=cv2.INTER_AREA)
            return frame
        except Exception:
            # OpenCV 在设备拔插/异常时会抛 C++ 异常，返回 None 让管线走重连逻辑
            return None

    def release(self) -> None:
        if self._cap is not None:
            _safe_release(self._cap)
            self._cap = None
        self._opened = False

    def info(self) -> SourceInfo:
        if self._cap is not None:
            try:
                w = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                h = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                fps = float(self._cap.get(cv2.CAP_PROP_FPS) or 0)
                self._info.width, self._info.height, self._info.fps = w, h, fps
                self._info.connected = self._opened
            except Exception:
                pass
        return self._info


def enumerate_webcams(max_index: int = 9) -> list[dict]:
    """枚举本机可用的摄像头索引（探测 0..max_index）。

    对每个索引按 [DSHOW, MSMF, ANY] 依次尝试，任意 backend 能成功打开且
    读出的不是黑帧即视为可用，返回第一个成功的 backend。这样能避免单一
    backend 漏掉设备（Pocket 3 在 Win11 上经常只有 MSMF 能打开），
    也能避免 DSHOW 假打开（isOpened=True 但持续黑帧）误列为可用设备。

    返回 [{index, label, width, height, readable, backend}]；同时尝试读取
    Windows 设备友好名称（如 "OSMO Pocket 3"），尽力而为，失败不阻塞。
    """
    names = _windows_camera_names()
    devices = []
    for i in range(max_index + 1):
        # 单索引整体异常保护：某台设备在读取中抛 cv2.error 不能中断整个枚举
        try:
            used_backend = None
            cap = None
            tried: list[str] = []
            for b in _WIN_BACKENDS:
                tried.append(_backend_label(b))
                cap = _try_open(i, b, do_read=True, require_non_black=True)
                if cap is not None:
                    used_backend = b
                    break

            if cap is None:
                # 这个 index 下所有 backend 都打不开或全是黑帧，跳过
                continue

            # 用统一的探测分辨率，避免与 WebcamSource.open 不一致
            _safe_set(cap, cv2.CAP_PROP_FRAME_WIDTH, _PROBE_W)
            _safe_set(cap, cv2.CAP_PROP_FRAME_HEIGHT, _PROBE_H)
            frame = _safe_read(cap)
            w, h = 0, 0
            try:
                w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            except Exception:
                pass
            backend_label = _backend_label(used_backend) if used_backend is not None else "?"
            _safe_release(cap)

            # 名称匹配：先按枚举顺序，匹配不到就回退到索引
            name = names.get(i) or names.get(len(devices)) or f"摄像头 {i}"
            devices.append({
                "index": i,
                "label": f"摄像头 {i} · {name} · {backend_label}",
                "width": w,
                "height": h,
                "readable": frame is not None,
                "backend": backend_label,
                "tried_backends": tried,
            })
        except Exception as exc:
            logger.warning(f"枚举摄像头 {i} 时异常(已跳过): {exc}")
            continue
    return devices


def _windows_camera_names() -> dict[int, str]:
    """用 PowerShell 查询相机类设备的友好名称，按枚举顺序尽力映射到索引。"""
    try:
        import subprocess
        ps = (
            "Get-PnpDevice -PresentOnly | Where-Object { "
            "($_.Class -eq 'Camera' -or $_.Class -eq 'Image') -and $_.Status -eq 'OK' "
            "} | ForEach-Object { $_.FriendlyName }"
        )
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps],
            capture_output=True, text=True, timeout=15,
        ).stdout
        lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
        return {i: ln for i, ln in enumerate(lines)}
    except Exception:
        return {}

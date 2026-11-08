# -*- coding: utf-8 -*-
"""
检测管线（双引擎 + 三线程架构）：
  - 推流线程 _loop：持续 取流 → 用合并检测结果画框 → JPEG 压缩 → 发布。画面始终流畅。
  - 主检测线程 _detect_loop_primary：YOLO 逐帧实时检测（12fps+），结果回写 _primary_dets。
  - 复核检测线程 _detect_loop_secondary：英伟达 LocateAnything-3B 低频复核（每 5 秒），
    开放词汇确认目标，结果回写 _secondary_dets。
  - 画框时合并 primary + secondary，YOLO 绿色框、LA 橙色框。
所有跨线程状态通过锁保护；最新帧用引用替换（原子）。
"""
from __future__ import annotations

import threading
import time
import logging
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

from .config import ServiceConfig
from .sources import VideoSource, create_source
from .engines import DetectionEngine, create_engine, to_bbox_norm

logger = logging.getLogger("detect.pipeline")


@dataclass
class PipelineState:
    running: bool = False
    source_type: str = ""
    source_label: str = ""
    engine_id: str = ""
    secondary_engine_id: str = ""
    engine_loaded: bool = False
    secondary_loaded: bool = False
    frame_w: int = 0
    frame_h: int = 0
    fps: float = 0.0
    engine_fps: float = 0.0
    secondary_fps: float = 0.0
    last_detections: list = field(default_factory=list)
    detected: bool = False
    last_error: str = ""
    frame_seq: int = 0
    started_at: float = 0.0

    def to_dict(self) -> dict:
        d = self.__dict__.copy()
        d["detections"] = self.last_detections
        return d


class Pipeline:
    def __init__(self, cfg: ServiceConfig):
        self.cfg = cfg
        self.state = PipelineState()
        self._lock = threading.Lock()
        self._source: Optional[VideoSource] = None
        self._engine: Optional[DetectionEngine] = None          # 主引擎（YOLO 实时）
        self._secondary_engine: Optional[DetectionEngine] = None  # 复核引擎（LA 低频）
        self._thread: Optional[threading.Thread] = None
        self._detect_thread: Optional[threading.Thread] = None   # 主检测线程
        self._secondary_thread: Optional[threading.Thread] = None  # 复核检测线程
        self._stop = threading.Event()
        self._jpeg: Optional[bytes] = None
        self._jpeg_time = 0.0
        self._latest_frame: Optional[np.ndarray] = None
        self._primary_dets: list = []      # 主引擎检测结果（YOLO）
        self._secondary_dets: list = []    # 复核引擎检测结果（LA）
        self._last_detect_time: float = 0.0
        self._detection_ttl: float = 25.0
        # 全黑帧检测和自动恢复
        # 阈值调到 25（之前是 5，太宽松；DSHOW 假打开 Pocket 3 时帧均值 10-20 算"非全黑"但视觉仍是黑屏）
        self._consecutive_black_frames: int = 0
        self._black_frame_threshold: int = 8  # 连续8帧黑帧触发恢复（之前30，约0.25秒即可触发）
        self._black_frame_mean_threshold: float = 25.0  # 帧均值小于25视为黑帧
        # 重连冷却（秒）：设备持续黑帧时避免每 8 帧就重连一次造成状态抖动
        self._last_reconnect_ts: float = 0.0
        self._reconnect_cooldown: float = 15.0

    # ---------- 公开控制 ----------

    def select_source(self, source_type: str, **params) -> dict:
        """切换视频源。

        重要：摄像头 open() 是慢操作（Pocket 3 / UVC 设备可能 3-10 秒），
        不能在 self._lock 内执行，否则期间所有 /api/status、/api/live-detection
        轮询都会被阻塞，前端误判为「服务离线 / 频繁掉线」。

        做法：先在锁外完成构造 + open；open 成功后再上锁把 source 装回去，
        并按需重启推流线程。
        """
        # 1) 锁外构造并打开新源（慢操作不持锁）
        was_running = False
        with self._lock:
            was_running = self.state.running
            # 标记一个"切换中"状态，避免轮询误判
            self.state.last_error = "正在连接设备…"

        if was_running:
            self._stop.set()
            self._join_threads()
            self._stop.clear()

        # 释放旧 source（锁外）
        old_source = None
        with self._lock:
            old_source = self._source
            self._source = None
        if old_source is not None:
            try:
                old_source.release()
            except Exception:
                pass

        # 构造 + 打开新 source（锁外，慢操作）
        try:
            new_source = create_source(source_type, **params)
            info = new_source.open()
        except Exception as exc:
            # 打开失败：回填错误状态
            with self._lock:
                self.state.source_type = source_type
                self.state.source_label = ""
                self.state.last_error = f"设备连接失败：{exc}"
            return {"ok": False, "error": str(exc)}

        # 2) 锁内装配 + 状态回填（快操作）
        with self._lock:
            self._source = new_source
            self.state.source_type = source_type
            self.state.source_label = info.label
            self.state.frame_w, self.state.frame_h = info.width, info.height
            self.state.last_error = ""
            # 装配成功后再决定是否重启推流
            should_restart = was_running

        if should_restart:
            self.start()
        return {"ok": True, **info.__dict__}

    def select_engine(self, engine_id: str, **params) -> dict:
        """选择主引擎（YOLO 实时）。

        create_engine 只是构造，不阻塞；但 _engine.unload()（卸载旧模型权重）
        是慢操作，必须在锁外执行，避免阻塞 status 轮询。
        """
        was_running = False
        with self._lock:
            was_running = self.state.running

        if was_running:
            self._stop.set()
            self._join_threads()
            self._stop.clear()

        # 锁外卸载旧引擎（慢操作）
        old_engine = None
        with self._lock:
            old_engine = self._engine
            self._engine = None
        if old_engine is not None:
            try:
                old_engine.unload()
            except Exception as exc:
                logger.warning(f"旧引擎卸载失败(已忽略): {exc}")

        # 锁内构造新引擎（快操作）
        with self._lock:
            self._engine = create_engine(engine_id, **params)
            self.state.engine_id = engine_id
            self.state.engine_loaded = False
            self._primary_dets = []
            should_restart = was_running

        if should_restart:
            self.start()
        return {"ok": True, "engine": engine_id}

    def select_secondary_engine(self, engine_id: str, **params) -> dict:
        """选择/启用复核引擎（LA 低频开放词汇）。传 engine_id=None 可停用。"""
        with self._lock:
            if self._secondary_engine:
                self._secondary_engine.unload()
                self._secondary_engine = None
            if engine_id is None:
                self.state.secondary_engine_id = ""
                self.state.secondary_loaded = False
                self._secondary_dets = []
                return {"ok": True, "secondary": None}
            self._secondary_engine = create_engine(engine_id, **params)
            self.state.secondary_engine_id = engine_id
            self.state.secondary_loaded = False
            # 如果正在运行，重启线程以启动复核
            if self.state.running:
                self._stop.set()
                self._join_threads()
                self._stop.clear()
                self._start_threads()
            return {"ok": True, "secondary": engine_id}

    def start(self) -> dict:
        with self._lock:
            if self.state.running:
                return {"ok": True, "running": True}
            if self._source is None:
                self._source = create_source(self.cfg.default_source_type,
                                             index=self.cfg.default_webcam_index)
                info = self._source.open()
                self.state.source_type = self.cfg.default_source_type
                self.state.source_label = info.label
                self.state.frame_w, self.state.frame_h = info.width, info.height
            # 主引擎默认 YOLO（实时）—— 直接创建，避免与 select_engine 的锁死锁
            if self._engine is None:
                self._engine = create_engine("yolo",
                                              model=self.cfg.yolo_model,
                                              imgsz=self.cfg.yolo_imgsz,
                                              conf=self.cfg.yolo_conf,
                                              device=self.cfg.resolve_device(),
                                              trained_weights=self.cfg.yolo_trained_weights)
                self.state.engine_id = "yolo"
                self.state.engine_loaded = False
            # 复核引擎默认 LocateAnything（开放词汇低频复核）
            if self._secondary_engine is None and getattr(self.cfg, "enable_secondary", False):
                self._secondary_engine = create_engine(
                    "locateanything",
                    model_id=self.cfg.la_model_id,
                    prompt=self.cfg.la_prompt,
                    precision=self.cfg.la_precision,
                    max_image_side=self.cfg.la_max_image_side,
                )
                self.state.secondary_engine_id = "locateanything"
                self.state.secondary_loaded = False
            self.state.running = True
            self.state.started_at = time.time()
            self._stop.clear()
            self._start_threads()
            return {"ok": True, "running": True}

    def _start_threads(self) -> None:
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._detect_thread = threading.Thread(target=self._detect_loop_primary, daemon=True)
        self._thread.start()
        self._detect_thread.start()
        if self._secondary_engine is not None:
            self._secondary_thread = threading.Thread(target=self._detect_loop_secondary, daemon=True)
            self._secondary_thread.start()

    def stop(self) -> dict:
        with self._lock:
            self._stop.set()
            self._join_threads()
            self.state.running = False
            return {"ok": True, "running": False}

    def _join_threads(self) -> None:
        for t in (self._thread, self._detect_thread, self._secondary_thread):
            if t:
                t.join(timeout=10)
        self._thread = None
        self._detect_thread = None
        self._secondary_thread = None

    def set_detection_cfg(self, **patch) -> dict:
        """运行时调整：conf / prompt / generation_mode（作用于主引擎+复核引擎）。"""
        with self._lock:
            results = {}
            for eng_name, eng in (("primary", self._engine), ("secondary", self._secondary_engine)):
                if eng is None:
                    continue
                if "conf" in patch and hasattr(eng, "conf"):
                    eng.conf = float(patch["conf"])
                if "prompt" in patch and hasattr(eng, "set_prompt"):
                    eng.set_prompt(str(patch["prompt"]))
                    if eng_name == "secondary":
                        self._secondary_dets = []
                    else:
                        self._primary_dets = []
                        self.state.last_detections = []
                if "generation_mode" in patch and hasattr(eng, "generation_mode"):
                    eng.generation_mode = str(patch["generation_mode"])
                results[eng_name] = True
            return {"ok": True, **results}

    def get_latest_jpeg(self) -> Optional[bytes]:
        return self._jpeg

    def get_state(self) -> dict:
        with self._lock:
            # 合并 primary + secondary 检测结果
            merged = []
            for d in self._primary_dets:
                merged.append(self._norm_det(d))
            for d in self._secondary_dets:
                merged.append(self._norm_det(d))
            self.state.last_detections = merged
            self.state.detected = len(merged) > 0
            return self.state.to_dict()

    def _norm_det(self, d) -> dict:
        w, h = self.state.frame_w or 1, self.state.frame_h or 1
        return {
            "label": d.label,
            "class_name": d.label,
            "confidence": round(d.confidence, 4),
            "score": round(d.confidence, 4),
            "engine": d.engine,
            "bbox": list(d.bbox),
            "bbox_norm": to_bbox_norm(d, w, h),
        }

    def get_engine_info(self) -> dict:
        with self._lock:
            info = {"engine": None, "secondary": None}
            if self._engine:
                eng_info = self._engine.info()
                info["engine"] = eng_info.__dict__
                info["load_progress"] = getattr(self._engine, "load_progress", "")
            if self._secondary_engine:
                sec_info = self._secondary_engine.info()
                info["secondary"] = sec_info.__dict__
                info["secondary_load_progress"] = getattr(self._secondary_engine, "load_progress", "")
            return info

    # ---------- 推流线程 ----------

    def _loop(self) -> None:
        last_draw = 0.0
        prev_time = time.time()
        ema_fps = 0.0
        cfg = self.cfg
        cv_ = cv2

        while not self._stop.is_set():
            try:
                frame = self._source.read() if self._source else None
                if frame is None:
                    time.sleep(0.05)
                    continue
                now = time.time()
                dt = now - prev_time
                prev_time = now
                h, w = frame.shape[:2]
                self.state.frame_w, self.state.frame_h = w, h
                self._latest_frame = frame
                # 调试：记录帧亮度（每30帧一次）
                if self.state.frame_seq % 30 == 0:
                    gray_mean = float(frame.mean())
                    logging.getLogger("detect.pipeline").debug(f"推流帧 seq={self.state.frame_seq}, shape={frame.shape}, mean={gray_mean:.1f}")

                # 全黑帧检测和自动恢复
                gray_mean = float(frame.mean())
                if gray_mean < self._black_frame_mean_threshold:
                    self._consecutive_black_frames += 1
                    if self._consecutive_black_frames >= self._black_frame_threshold:
                        # 重连冷却：设备持续黑帧时（如相机被物理遮挡、未切 Webcam 模式），
                        # 不能每 8 帧（约 0.5s）就重连一次，否则状态反复 running↔stopped 抖动。
                        now_ts = time.time()
                        if now_ts - self._last_reconnect_ts < self._reconnect_cooldown:
                            # 冷却中：重置计数，保持当前流继续跑，避免抖动
                            self._consecutive_black_frames = 0
                        else:
                            self._last_reconnect_ts = now_ts
                            logger.warning(
                                f"连续{self._consecutive_black_frames}帧全黑(mean={gray_mean:.1f})，"
                                f"尝试重新打开摄像头源..."
                            )
                            try:
                                if self._source:
                                    self._source.release()
                                    time.sleep(1.5)  # 等待摄像头完全释放
                                    info = self._source.open()
                                    self.state.source_label = info.label
                                    self.state.frame_w, self.state.frame_h = info.width, info.height
                                    self.state.last_error = ""
                                    logger.info(f"摄像头源重新打开成功: {info.label}, {info.width}x{info.height}")
                            except Exception as e:
                                logger.error(f"重新打开摄像头源失败: {e}")
                                self.state.last_error = f"摄像头源恢复失败: {e}"
                            self._consecutive_black_frames = 0
                else:
                    self._consecutive_black_frames = 0

                # 合并主引擎+复核引擎检测结果画框
                with self._lock:
                    primary_dets = list(self._primary_dets)
                    secondary_dets = list(self._secondary_dets)
                    last_dt = self._last_detect_time
                all_dets = primary_dets + secondary_dets

                # 检测结果有效期
                if all_dets and (time.time() - last_dt) > self._detection_ttl:
                    all_dets = []
                    with self._lock:
                        self._primary_dets = []
                        self._secondary_dets = []
                        self.state.detected = False

                if all_dets:
                    annotated = frame.copy()
                    fh, fw = frame.shape[:2]
                    frame_area = fw * fh
                    for d in all_dets:
                        x1, y1, x2, y2 = d.bbox
                        det_area = max(0, x2 - x1) * max(0, y2 - y1)
                        if det_area > frame_area * 0.85:
                            continue
                        # YOLO 绿色，LA 橙色
                        color = (0, 255, 140) if d.engine == "yolo" else (255, 180, 40)
                        cv_.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                        tag = "YOLO" if d.engine == "yolo" else "LA"
                        label = f"{d.label} {d.confidence:.2f} [{tag}]"
                        cv_.putText(annotated, label, (x1, max(16, y1 - 6)),
                                    cv_.FONT_HERSHEY_SIMPLEX, 0.5, color, 2, cv_.LINE_AA)
                    frame = annotated

                if now - last_draw >= 1.0 / cfg.max_stream_fps:
                    ok, buf = cv_.imencode(".jpg", frame, [cv_.IMWRITE_JPEG_QUALITY, cfg.jpeg_quality])
                    if ok:
                        self._jpeg = buf.tobytes()
                        self._jpeg_time = now
                    last_draw = now
                    with self._lock:
                        self.state.frame_seq += 1
                        self.state.fps = ema_fps

                inst = 1.0 / max(1e-6, dt)
                ema_fps = ema_fps * 0.9 + inst * 0.1 if ema_fps else inst
            except Exception as exc:
                logger = logging.getLogger("detect.pipeline")
                logger.warning(f"推流线程异常(已忽略): {exc}")
                # OpenCV 异常时自动尝试重新打开摄像头源
                if "OpenCV" in str(exc) or "C++" in str(exc):
                    try:
                        if self._source:
                            logger.warning("OpenCV异常，尝试重新打开摄像头源...")
                            self._source.release()
                            time.sleep(2.0)  # 等待摄像头完全释放
                            info = self._source.open()
                            self.state.source_label = info.label
                            self.state.frame_w, self.state.frame_h = info.width, info.height
                            self.state.last_error = ""
                            logger.info(f"摄像头源重新打开成功: {info.label}, {info.width}x{info.height}")
                    except Exception as e:
                        logger.error(f"重新打开摄像头源失败: {e}")
                        self.state.last_error = f"摄像头源恢复失败: {e}"
                time.sleep(0.2)

        with self._lock:
            self.state.running = False

    # ---------- 主检测线程：YOLO 逐帧实时 ----------

    def _detect_loop_primary(self) -> None:
        if self._engine is None:
            return
        try:
            info = self._engine.load()
            self.state.engine_loaded = info.loaded
            self.state.last_error = info.error or ""
        except Exception as exc:
            self.state.engine_loaded = False
            self.state.last_error = str(exc)
            return

        cfg = self.cfg
        last_detect = 0.0
        ema_fps = 0.0
        prev_time = time.time()
        while not self._stop.is_set():
            try:
                now = time.time()
                interval = 1.0 / cfg.target_fps
                if now - last_detect >= interval:
                    frame = self._latest_frame
                    if frame is not None and self._engine is not None:
                        try:
                            dets = self._engine.detect(frame)
                            conf_th = getattr(self._engine, "conf", 0.25) - 0.001
                            detections = [d for d in dets if d.confidence >= conf_th]
                            with self._lock:
                                self._primary_dets = list(detections)
                                self.state.engine_fps = ema_fps
                                self.state.last_error = ""
                                self._last_detect_time = time.time()
                        except Exception as exc:
                            with self._lock:
                                self.state.last_error = str(exc)[:300]
                    last_detect = time.time()
                dt = time.time() - prev_time
                prev_time = time.time()
                inst = 1.0 / max(1e-6, dt)
                ema_fps = ema_fps * 0.9 + inst * 0.1 if ema_fps else inst
                time.sleep(0.05)
            except Exception as exc:
                logging.getLogger("detect.pipeline").warning(f"主检测线程异常(已忽略): {exc}")
                time.sleep(0.1)

    # ---------- 复核检测线程：LA 低频开放词汇 ----------

    def _detect_loop_secondary(self) -> None:
        if self._secondary_engine is None:
            return
        try:
            info = self._secondary_engine.load()
            self.state.secondary_loaded = info.loaded
            if info.error:
                self.state.last_error = f"[复核] {info.error}"
        except Exception as exc:
            self.state.secondary_loaded = False
            self.state.last_error = f"[复核] {str(exc)[:200]}"
            return

        cfg = self.cfg
        last_detect = 0.0
        ema_fps = 0.0
        prev_time = time.time()
        while not self._stop.is_set():
            try:
                now = time.time()
                interval = getattr(cfg, "la_interval_seconds", 5.0)
                if now - last_detect >= interval:
                    frame = self._latest_frame
                    if frame is not None and self._secondary_engine is not None:
                        try:
                            dets = self._secondary_engine.detect(frame)
                            conf_th = getattr(self._secondary_engine, "conf", 0.25) - 0.001
                            detections = [d for d in dets if d.confidence >= conf_th]
                            with self._lock:
                                self._secondary_dets = list(detections)
                                self.state.secondary_fps = ema_fps
                                self._last_detect_time = time.time()
                        except Exception as exc:
                            pass  # 复核引擎错误不影响主引擎
                    last_detect = time.time()
                dt = time.time() - prev_time
                prev_time = time.time()
                inst = 1.0 / max(1e-6, dt)
                ema_fps = ema_fps * 0.9 + inst * 0.1 if ema_fps else inst
                time.sleep(0.5)
            except Exception as exc:
                logging.getLogger("detect.pipeline").warning(f"复核检测线程异常(已忽略): {exc}")
                time.sleep(0.5)

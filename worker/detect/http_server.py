# -*- coding: utf-8 -*-
"""
检测服务 HTTP API（纯标准库，无框架依赖）。

路由：
    GET  /                      状态说明页
    GET  /api/status            服务/源/引擎状态（含双引擎）
    GET  /api/cameras           枚举本机摄像头（webcam）
    GET  /api/engines           可用检测引擎列表
    POST /api/source/select     {type: webcam|stream|drone|file, ...}
    POST /api/engine/select     {engine: yolo|locateanything, ...}  主引擎
    POST /api/engine/secondary  {engine: yolo|locateanything|null, ...}  复核引擎
    POST /api/detection/start | /api/detection/stop
    POST /api/detection/config  {conf?, prompt?, generation_mode?}
    GET  /api/live-detection    最新检测结果（双引擎合并）
    GET  /video                 MJPEG 实时流
    ---- 设备管理 ----
    GET  /api/devices           列出所有已添加设备
    GET  /api/devices/presets   列出设备预设（Pocket 3/索尼/海康/大疆等）
    POST /api/devices/add       {name, type, params, note?}
    POST /api/devices/preset    {preset_key, overrides?}
    POST /api/devices/remove    {id}
    POST /api/devices/select    {id}  选择设备作为视频源
"""
from __future__ import annotations

import json
import logging
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from .config import ServiceConfig
from .pipeline import Pipeline
from .sources import webcam_source
from .engines import list_engine_ids
from .device_manager import DeviceManager

MJPEG_BOUNDARY = "frame"

logger = logging.getLogger("detect.http")


class DetectHandler(BaseHTTPRequestHandler):
    pipeline: Pipeline = None  # type: ignore[assignment]
    cfg: ServiceConfig = None  # type: ignore[assignment]
    devices: DeviceManager = None  # type: ignore[assignment]
    server_version = "ElephantDetect/0.2"

    # ---- 工具 ----

    def _send_json(self, obj: dict, status: int = 200) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    # ---- HTTP ----

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/" or path == "/api/status":
            self._handle_status()
        elif path == "/api/cameras":
            self._handle_cameras()
        elif path == "/api/engines":
            self._send_json({"engines": list_engine_ids()})
        elif path == "/api/memory/status":
            try:
                from .memory_check import get_system_memory_info, get_memory_status_message
                mem_info = get_system_memory_info()
                mem_info["message"] = get_memory_status_message()
                mem_info["ok"] = True
                self._send_json(mem_info)
            except Exception as exc:
                self._send_json({"ok": False, "error": str(exc)}, 400)
        elif path == "/api/logs":
            self._handle_logs()
        elif path == "/api/live-detection":
            self._handle_live_detection()
        elif path == "/api/devices":
            self._handle_list_devices()
        elif path == "/api/devices/presets":
            self._handle_list_presets()
        elif path == "/video":
            self._handle_mjpeg()
        else:
            self._send_json({"error": f"未知路径: {path}"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        body = self._read_body()
        if path == "/api/source/select":
            try:
                stype = body.get("type", self.cfg.default_source_type)
                params = {k: v for k, v in body.items() if k != "type"}
                self._send_json(self.pipeline.select_source(stype, **params))
            except Exception as exc:
                self._send_json({"ok": False, "error": str(exc)}, 400)
        elif path == "/api/engine/select":
            try:
                eid = body.get("engine", self.cfg.default_engine)
                params = {k: v for k, v in body.items() if k not in ("engine", "type")}
                result = self.pipeline.select_engine(eid, **params)
                self._send_json(result)
            except Exception as exc:
                error_msg = str(exc)
                logger.warning(f"引擎选择失败({eid})，自动回退到 YOLO: {error_msg}")
                try:
                    fallback = self.pipeline.select_engine("yolo")
                    fallback["warning"] = f"{eid} 加载失败，已自动回退到 YOLO。原因：{error_msg}"
                    self._send_json(fallback)
                except Exception as fallback_exc:
                    self._send_json({"ok": False, "error": f"引擎选择失败且回退 YOLO 也失败: {fallback_exc}"}, 400)
        elif path == "/api/engine/secondary":
            self._send_json({"ok": True, "secondary_engine": None, "note": "复核引擎已移除，仅使用 YOLO 主引擎"})
        elif path == "/api/detection/start":
            self._send_json(self.pipeline.start())
        elif path == "/api/detection/stop":
            self._send_json(self.pipeline.stop())
        elif path == "/api/detection/config":
            self._send_json(self.pipeline.set_detection_cfg(**body))
        # ---- 设备管理 ----
        elif path == "/api/devices/add":
            try:
                dev = self.devices.add_device(
                    name=body.get("name", ""),
                    type=body.get("type", "webcam"),
                    params=body.get("params", {}),
                    note=body.get("note", ""),
                )
                self._send_json({"ok": True, "device": dev.to_dict()})
            except Exception as exc:
                self._send_json({"ok": False, "error": str(exc)}, 400)
        elif path == "/api/devices/preset":
            try:
                preset_key = body.get("preset_key", "")
                overrides = body.get("overrides")
                dev = self.devices.add_from_preset(preset_key, overrides)
                if dev is None:
                    self._send_json({"ok": False, "error": f"未知预设: {preset_key}"}, 400)
                else:
                    self._send_json({"ok": True, "device": dev.to_dict()})
            except Exception as exc:
                self._send_json({"ok": False, "error": str(exc)}, 400)
        elif path == "/api/devices/remove":
            ok = self.devices.remove_device(body.get("id", ""))
            self._send_json({"ok": ok})
        elif path == "/api/devices/select":
            try:
                dev = self.devices.get_device(body.get("id", ""))
                if dev is None:
                    self._send_json({"ok": False, "error": "设备不存在"}, 404)
                else:
                    result = self.pipeline.select_source(dev.type, **dev.params)
                    result["device_id"] = dev.id
                    result["device_name"] = dev.name
                    self._send_json(result)
            except Exception as exc:
                self._send_json({"ok": False, "error": str(exc)}, 400)
        else:
            self._send_json({"error": f"未知路径: {path}"}, 404)

    # ---- 具体处理 ----

    def _handle_status(self) -> None:
        state = self.pipeline.get_state()
        engine = self.pipeline.get_engine_info()
        self._send_json({"ok": True, "service": "detect-service", "state": state, **engine})

    _cam_cache: list = None
    _cam_cache_time: float = 0
    _cam_cache_lock = None

    def _handle_cameras(self) -> None:
        try:
            query = parse_qs(urlparse(self.path).query)
            force_refresh = query.get("refresh", ["0"])[0] in ("1", "true", "yes")
            now = time.time()
            if force_refresh or self._cam_cache is None or (now - self._cam_cache_time) >= 30:
                devices = webcam_source.enumerate_webcams()
                type(self)._cam_cache = devices
                type(self)._cam_cache_time = now
            else:
                devices = self._cam_cache
            self._send_json({"ok": True, "devices": devices})
        except Exception as exc:
            logger.exception("枚举摄像头失败")
            self._send_json({"ok": False, "error": str(exc)}, 500)

    def _handle_list_devices(self) -> None:
        devices = [d.to_dict() for d in self.devices.list_devices()]
        self._send_json({"ok": True, "devices": devices, "count": len(devices)})

    def _handle_list_presets(self) -> None:
        presets = []
        for key, p in DeviceManager.PRESETS.items():
            presets.append({
                "key": key,
                "name": p["name"],
                "type": p["type"],
                "params": p["params"],
                "note": p["note"],
            })
        self._send_json({"ok": True, "presets": presets, "count": len(presets)})

    def _handle_live_detection(self) -> None:
        state = self.pipeline.get_state()
        dets = state.get("detections", [])
        max_conf = max((d.get("score", 0) for d in dets), default=0)
        primary = dets[0] if dets else None
        engines = []
        if state.get("engine_id"):
            engines.append(state["engine_id"])
        if state.get("secondary_engine_id"):
            engines.append(f"{state['secondary_engine_id']}(复核)")
        self._send_json({
            "connected": bool(state.get("running")),
            "running": bool(state.get("running")),
            "mode": "real",
            "source": state.get("source_type", ""),
            "engine": "+".join(engines) if engines else "",
            "detected": bool(state.get("detected")),
            "class_name": primary["class_name"] if primary else "",
            "confidence": max_conf,
            "max_confidence": max_conf,
            "count": len(dets),
            "detected_count": len(dets),
            "bbox": primary["bbox_norm"] if primary else None,
            "detections": [{
                "track_id": i + 1,
                "class_name": d["class_name"],
                "score": d["score"],
                "engine": d.get("engine", ""),
                "bbox_norm": d["bbox_norm"],
            } for i, d in enumerate(dets)],
            "frame": state.get("frame_seq", 0),
            "fps": round(state.get("fps", 0), 1),
            "engine_fps": round(state.get("engine_fps", 0), 1),
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime()),
            "note": "YOLO 实时检测",
        })

    def _handle_logs(self) -> None:
        """返回检测服务日志（支持 ?lines=N 指定返回最后N行，默认200行）。"""
        try:
            query = parse_qs(urlparse(self.path).query)
            lines = int(query.get("lines", [200])[0])
            lines = max(10, min(lines, 2000))

            import os
            log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
            if not os.path.isdir(log_dir):
                self._send_json({"ok": True, "logs": [], "log_files": [], "note": "日志目录不存在"})
                return

            # 列出所有日志文件，按修改时间排序
            log_files = []
            for f in os.listdir(log_dir):
                if f.endswith(".log"):
                    fpath = os.path.join(log_dir, f)
                    mtime = os.path.getmtime(fpath)
                    log_files.append({"name": f, "size": os.path.getsize(fpath), "mtime": mtime})
            log_files.sort(key=lambda x: x["mtime"], reverse=True)

            # 读取最新的日志文件
            logs = []
            if log_files:
                latest = os.path.join(log_dir, log_files[0]["name"])
                try:
                    with open(latest, "r", encoding="utf-8", errors="replace") as f:
                        all_lines = f.readlines()
                        logs = [line.rstrip("\n") for line in all_lines[-lines:]]
                except Exception as e:
                    logs = [f"[读取日志失败] {e}"]

            self._send_json({
                "ok": True,
                "logs": logs,
                "log_files": [{"name": f["name"], "size": f["size"]} for f in log_files],
                "current_file": log_files[0]["name"] if log_files else "",
                "returned_lines": len(logs),
            })
        except Exception as exc:
            self._send_json({"ok": False, "error": str(exc), "logs": []}, 400)

    def _handle_mjpeg(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", f"multipart/x-mixed-replace; boundary={MJPEG_BOUNDARY}")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            while not self.server._stop:  # type: ignore[attr-defined]
                jpeg = self.pipeline.get_latest_jpeg()
                if jpeg:
                    self.wfile.write(b"--%s\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n" % (
                        MJPEG_BOUNDARY.encode(), len(jpeg)))
                    self.wfile.write(jpeg)
                    self.wfile.write(b"\r\n")
                else:
                    time.sleep(0.1)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        if "/video" in (args[0] if args else ""):
            return
        super().log_message(fmt, *args)


class DetectServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, addr: tuple, cfg: ServiceConfig, pipeline: Pipeline, devices: DeviceManager):
        super().__init__(addr, DetectHandler)
        self._stop = False
        DetectHandler.pipeline = pipeline
        DetectHandler.cfg = cfg
        DetectHandler.devices = devices

    def stop(self) -> None:
        self._stop = True
        self.shutdown()


def run_server(cfg: ServiceConfig, pipeline: Pipeline) -> None:
    import logging
    logger = logging.getLogger("detect.http")
    storage = Path(__file__).resolve().parent / "devices.json"
    devices = DeviceManager(storage)
    server = DetectServer((cfg.host, cfg.port), cfg, pipeline, devices)
    logger.info(f"检测服务已启动: {cfg.base_url}")
    logger.info(f"  实时流: {cfg.base_url}/video")
    logger.info(f"  状态:   {cfg.base_url}/api/status")
    logger.info(f"  摄像头: {cfg.base_url}/api/cameras")
    logger.info(f"  设备:   {cfg.base_url}/api/devices  (预设: {cfg.base_url}/api/devices/presets)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("收到中断信号")
    except Exception as exc:
        logger.critical(f"HTTP 服务器异常: {exc}", exc_info=True)
    finally:
        try:
            server.stop()
        except Exception:
            pass
        try:
            pipeline.stop()
        except Exception:
            pass

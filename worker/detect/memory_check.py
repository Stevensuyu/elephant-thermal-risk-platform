# -*- coding: utf-8 -*-
"""系统内存检查工具，用于在加载大模型前检查可用内存，避免 OOM 崩溃。"""
from __future__ import annotations

import logging
import os
import sys
from typing import Optional

logger = logging.getLogger("detect.memory")


def get_system_memory_info() -> dict:
    """获取系统内存信息（总内存、可用内存、已用内存），单位 GB。"""
    try:
        import psutil
        mem = psutil.virtual_memory()
        return {
            "total_gb": round(mem.total / (1024 ** 3), 2),
            "available_gb": round(mem.available / (1024 ** 3), 2),
            "used_gb": round(mem.used / (1024 ** 3), 2),
            "percent": mem.percent,
        }
    except ImportError:
        # psutil 不可用时，用 Windows API 或 /proc/meminfo 兜底
        return _get_memory_fallback()


def _get_memory_fallback() -> dict:
    """psutil 不可用时的兜底方案。"""
    if sys.platform == "win32":
        try:
            import ctypes
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]
            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
            return {
                "total_gb": round(stat.ullTotalPhys / (1024 ** 3), 2),
                "available_gb": round(stat.ullAvailPhys / (1024 ** 3), 2),
                "used_gb": round((stat.ullTotalPhys - stat.ullAvailPhys) / (1024 ** 3), 2),
                "percent": stat.dwMemoryLoad,
            }
        except Exception:
            pass
    return {"total_gb": 0, "available_gb": 0, "used_gb": 0, "percent": 0}


# 各引擎加载所需的最小可用内存（GB），留有余量
ENGINE_MEMORY_REQUIREMENTS = {
    "yolo": 1.0,           # YOLO 很小，1GB 足够
}


def check_memory_for_engine(engine_id: str) -> tuple[bool, str]:
    """检查当前可用内存是否足够加载指定引擎。

    Returns:
        (ok, message): ok=True 表示内存足够，message 为提示信息
    """
    mem_info = get_system_memory_info()
    required = ENGINE_MEMORY_REQUIREMENTS.get(engine_id, 2.0)
    available = mem_info.get("available_gb", 0)

    if available == 0:
        # 无法获取内存信息时，不阻止加载
        logger.warning("无法获取系统内存信息，跳过内存检查")
        return True, "无法获取内存信息，跳过检查"

    if available < required:
        msg = (
            f"可用内存不足：当前可用 {available}GB，"
            f"加载 {engine_id} 至少需要 {required}GB。"
            f"请关闭其他占用内存的程序后重试，或使用 YOLO 引擎。"
        )
        logger.warning(msg)
        return False, msg

    logger.info(f"内存检查通过：可用 {available}GB，{engine_id} 需要 {required}GB")
    return True, f"内存充足：可用 {available}GB"


def get_memory_status_message() -> str:
    """获取当前内存状态的友好提示。"""
    mem_info = get_system_memory_info()
    if mem_info.get("available_gb", 0) == 0:
        return "无法获取内存信息"
    return (
        f"总内存 {mem_info['total_gb']}GB，"
        f"可用 {mem_info['available_gb']}GB，"
        f"已用 {mem_info['percent']}%"
    )

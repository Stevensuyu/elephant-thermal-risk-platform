# -*- coding: utf-8 -*-
"""检测服务入口：python worker/detect/run.py

稳定性加固：
- 单进程锁：确保只有一个检测服务进程在运行，避免摄像头被多个进程占用
- 全局异常捕获，防止未处理异常导致进程崩溃
- 日志同时输出到控制台和文件（logs/detect.log）
- pipeline 线程异常不影响主进程
- 启动时自动检查端口占用，已有服务运行则直接退出
"""
from __future__ import annotations

import sys
import os
import time
import socket
import traceback
import logging
from pathlib import Path
from datetime import datetime

# 允许直接以脚本运行（python worker/detect/run.py）
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# 配置日志
LOG_DIR = Path(__file__).resolve().parent / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / f"detect_{datetime.now().strftime('%Y%m%d')}.log"
PID_FILE = Path(__file__).resolve().parent / "detect.pid"
SERVICE_PORT = 8765

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(str(LOG_FILE), encoding="utf-8"),
    ],
)
logger = logging.getLogger("detect")


def is_port_in_use(port: int) -> bool:
    """检查端口是否被占用。"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        try:
            s.connect(("127.0.0.1", port))
            return True
        except (socket.timeout, ConnectionRefusedError, OSError):
            return False


def check_and_cleanup_old_process() -> bool:
    """检查是否已有检测服务在运行，返回 True 表示可以启动新进程。"""
    # 1. 检查端口是否被占用
    if is_port_in_use(SERVICE_PORT):
        logger.warning(f"端口 {SERVICE_PORT} 已被占用，检测服务可能已在运行中")
        # 验证一下是否真的是检测服务
        try:
            import urllib.request
            req = urllib.request.Request(f"http://127.0.0.1:{SERVICE_PORT}/api/status")
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    logger.info("检测服务已在运行，本次启动取消（避免多进程冲突）")
                    return False
        except Exception:
            logger.warning("端口被占用但无法验证服务状态，尝试继续启动...")

    # 2. 检查 pid 文件
    if PID_FILE.exists():
        try:
            old_pid = int(PID_FILE.read_text().strip())
            # 检查旧进程是否还在运行
            try:
                os.kill(old_pid, 0)
                logger.warning(f"检测到旧进程 PID={old_pid} 仍在运行，等待其退出...")
                # 给旧进程 3 秒时间退出
                for _ in range(3):
                    time.sleep(1)
                    try:
                        os.kill(old_pid, 0)
                    except OSError:
                        break
                else:
                    logger.warning(f"旧进程 PID={old_pid} 未退出，强制杀掉...")
                    try:
                        os.kill(old_pid, 9)
                        time.sleep(1)
                    except Exception:
                        pass
            except OSError:
                logger.info(f"旧进程 PID={old_pid} 已不存在，清理 pid 文件")
        except (ValueError, OSError):
            pass
        try:
            PID_FILE.unlink()
        except OSError:
            pass

    return True


def main() -> None:
    logger.info("=" * 60)
    logger.info("检测服务启动中...")
    logger.info(f"日志文件: {LOG_FILE}")
    logger.info(f"当前进程 PID: {os.getpid()}")

    # 单进程锁：检查并清理旧进程
    if not check_and_cleanup_old_process():
        logger.info("检测服务已在运行，本次启动取消")
        sys.exit(0)

    # 写入 pid 文件
    try:
        PID_FILE.write_text(str(os.getpid()), encoding="utf-8")
    except OSError:
        logger.warning("无法写入 pid 文件")

    try:
        from detect.config import load_config
        from detect.pipeline import Pipeline
        from detect.http_server import run_server

        cfg = load_config()
        pipeline = Pipeline(cfg)
        logger.info("Pipeline 初始化完成")
        logger.info("等待用户在设置页面添加设备并启动检测...")

        run_server(cfg, pipeline)
    except KeyboardInterrupt:
        logger.info("收到中断信号，正在退出...")
    except Exception as exc:
        logger.critical(f"检测服务崩溃: {exc}", exc_info=True)
        logger.critical(f"堆栈跟踪:\n{traceback.format_exc()}")
        # 写入崩溃标记文件，方便前端检测
        crash_file = Path(__file__).resolve().parent / "last_crash.txt"
        crash_file.write_text(
            f"时间: {datetime.now().isoformat()}\n"
            f"错误: {exc}\n"
            f"堆栈:\n{traceback.format_exc()}",
            encoding="utf-8",
        )
        sys.exit(1)
    finally:
        # 清理 pid 文件
        try:
            if PID_FILE.exists():
                PID_FILE.unlink()
        except OSError:
            pass
        logger.info("检测服务已退出")


if __name__ == "__main__":
    main()

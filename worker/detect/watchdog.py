# -*- coding: utf-8 -*-
"""
天眼护象 - 后端守护进程
功能：监控后端检测服务健康状态，卡死自动重启
"""
import sys
import os
import subprocess
import time
import urllib.request
import logging
from pathlib import Path
from datetime import datetime

# 配置
BASE_DIR = Path(__file__).resolve().parent
BACKEND_SCRIPT = BASE_DIR / "run.py"
VENV_PYTHON = BASE_DIR.parent.parent / ".venv" / "Scripts" / "python.exe"
LOG_DIR = BASE_DIR / "logs"
API_URL = "http://127.0.0.1:8765/api/status"
CHECK_INTERVAL = 5  # 检查间隔（秒）
MAX_FAILS = 3  # 连续失败次数达到此值则重启
RESTART_COOLDOWN = 10  # 重启冷却时间（秒）

# 日志配置
LOG_DIR.mkdir(exist_ok=True)
log_file = LOG_DIR / f"watchdog_{datetime.now().strftime('%Y%m%d')}.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] watchdog: %(message)s",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("watchdog")


def check_backend():
    """检查后端是否响应"""
    try:
        req = urllib.request.Request(API_URL, method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception:
        return False


def kill_backend():
    """杀掉所有后端进程"""
    logger.info("正在杀掉后端进程...")
    try:
        # Windows下杀掉所有python进程（只杀我们启动的）
        result = subprocess.run(
            ["wmic", "process", "where", "name='python.exe'", "get", "processid,commandline"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.splitlines():
            if "run.py" in line and "watchdog" not in line:
                parts = line.strip().split()
                if parts:
                    pid = parts[-1]
                    try:
                        subprocess.run(["taskkill", "/F", "/PID", pid],
                                      capture_output=True, timeout=5)
                        logger.info(f"  杀掉 PID={pid}")
                    except Exception as e:
                        logger.warning(f"  杀掉 PID={pid} 失败: {e}")
    except Exception as e:
        logger.warning(f"枚举进程失败: {e}")

    # 额外：杀掉占用8765端口的进程
    try:
        result = subprocess.run(["netstat", "-ano"], capture_output=True, text=True, timeout=10)
        for line in result.stdout.splitlines():
            if ":8765" in line and "LISTENING" in line:
                pid = line.strip().split()[-1]
                try:
                    subprocess.run(["taskkill", "/F", "/PID", pid],
                                  capture_output=True, timeout=5)
                    logger.info(f"  杀掉端口8765进程 PID={pid}")
                except Exception as e:
                    logger.warning(f"  杀掉端口8765进程 PID={pid} 失败: {e}")
    except Exception as e:
        logger.warning(f"检查端口失败: {e}")

    time.sleep(2)
    logger.info("后端进程已清理")


def start_backend():
    """启动后端进程"""
    python_exe = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable
    logger.info(f"启动后端: {python_exe} {BACKEND_SCRIPT}")
    try:
        # 使用 CREATE_NEW_PROCESS_GROUP 让进程独立于父进程
        creationflags = 0
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
        proc = subprocess.Popen(
            [python_exe, str(BACKEND_SCRIPT)],
            cwd=str(BASE_DIR.parent.parent),
            creationflags=creationflags,
        )
        logger.info(f"后端已启动 PID={proc.pid}")
        return proc
    except Exception as e:
        logger.error(f"后端启动失败: {e}")
        return None


def main():
    logger.info("=" * 60)
    logger.info("天眼护象 - 后端守护进程启动")
    logger.info(f"监控地址: {API_URL}")
    logger.info(f"检查间隔: {CHECK_INTERVAL}秒")
    logger.info(f"失败阈值: 连续{MAX_FAILS}次不响应则重启")
    logger.info("=" * 60)

    fail_count = 0
    last_restart_time = 0
    backend_proc = None

    # 首次启动
    backend_proc = start_backend()
    time.sleep(5)  # 等待后端启动

    while True:
        try:
            # 检查后端是否响应
            if check_backend():
                if fail_count > 0:
                    logger.info(f"后端恢复响应（连续失败{fail_count}次后恢复）")
                fail_count = 0
            else:
                fail_count += 1
                logger.warning(f"后端不响应（连续第{fail_count}次）")

                # 连续失败达到阈值，重启
                if fail_count >= MAX_FAILS:
                    now = time.time()
                    if now - last_restart_time < RESTART_COOLDOWN:
                        logger.warning(f"距离上次重启不足{RESTART_COOLDOWN}秒，跳过本次重启")
                        fail_count = 0
                        continue

                    logger.critical(f"后端连续{MAX_FAILS}次不响应，正在重启...")
                    kill_backend()
                    backend_proc = start_backend()
                    last_restart_time = time.time()
                    fail_count = 0
                    time.sleep(8)  # 等待新后端启动

        except KeyboardInterrupt:
            logger.info("收到中断信号，守护进程退出")
            break
        except Exception as e:
            logger.error(f"守护进程异常: {e}", exc_info=True)
            time.sleep(5)

        time.sleep(CHECK_INTERVAL)

    # 退出时清理
    logger.info("守护进程退出，正在清理后端...")
    kill_backend()


if __name__ == "__main__":
    main()

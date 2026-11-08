# -*- coding: utf-8 -*-
"""
天眼护象 - 桌面启动器
功能：双击启动后端检测服务 + 前端Web服务，右下角托盘管理，一键打开网页/查看日志/全部退出
"""
import sys
import os
import subprocess
import time
import webbrowser
import threading
from pathlib import Path

# 确定项目根目录（打包后exe所在目录，或开发时脚本所在目录）
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 路径配置
BACKEND_DIR = os.path.join(BASE_DIR, "worker", "detect")
BACKEND_SCRIPT = os.path.join(BACKEND_DIR, "run.py")
VENV_PYTHON = os.path.join(BASE_DIR, ".venv", "Scripts", "python.exe")
LOG_DIR = os.path.join(BACKEND_DIR, "logs")
WEB_PORT = 3000
API_PORT = 8765

# 全局进程句柄
proc_backend = None
proc_frontend = None
stop_event = threading.Event()


def log(msg):
    """简单日志输出"""
    print(f"[启动器] {msg}", flush=True)


def start_backend():
    """启动后端检测服务"""
    global proc_backend
    try:
        # 优先用venv的python，没有就用系统python
        python_exe = VENV_PYTHON if os.path.exists(VENV_PYTHON) else sys.executable
        log(f"启动后端: {python_exe} {BACKEND_SCRIPT}")
        proc_backend = subprocess.Popen(
            [python_exe, BACKEND_SCRIPT],
            cwd=BASE_DIR,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        log(f"后端进程已启动 PID={proc_backend.pid}")
        return True
    except Exception as e:
        log(f"后端启动失败: {e}")
        return False


def start_frontend():
    """启动前端Web服务（npm run start 生产模式）"""
    global proc_frontend
    try:
        log("启动前端: npm run start")
        # Windows下用cmd执行npm
        if sys.platform == "win32":
            proc_frontend = subprocess.Popen(
                ["cmd", "/c", "npm", "run", "start"],
                cwd=BASE_DIR,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
        else:
            proc_frontend = subprocess.Popen(
                ["npm", "run", "start"],
                cwd=BASE_DIR,
            )
        log(f"前端进程已启动 PID={proc_frontend.pid}")
        return True
    except Exception as e:
        log(f"前端启动失败: {e}")
        return False


def wait_for_services():
    """等待服务就绪"""
    log("等待服务启动...")
    for i in range(30):
        time.sleep(1)
        # 检查后端
        backend_ok = False
        frontend_ok = False
        try:
            import urllib.request
            urllib.request.urlopen(f"http://127.0.0.1:{API_PORT}/api/status", timeout=2)
            backend_ok = True
        except:
            pass
        try:
            import urllib.request
            urllib.request.urlopen(f"http://127.0.0.1:{WEB_PORT}", timeout=2)
            frontend_ok = True
        except:
            pass
        if backend_ok and frontend_ok:
            log(f"服务全部就绪！后端:{API_PORT} 前端:{WEB_PORT}")
            return True
        if i % 5 == 0:
            log(f"  等待中... 后端:{'OK' if backend_ok else '...'} 前端:{'OK' if frontend_ok else '...'}")
    log("服务启动超时，但继续运行")
    return False


def open_web(icon, item):
    """打开网页界面"""
    webbrowser.open(f"http://127.0.0.1:{WEB_PORT}")


def open_logs(icon, item):
    """打开日志文件夹"""
    os.makedirs(LOG_DIR, exist_ok=True)
    if sys.platform == "win32":
        os.startfile(LOG_DIR)
    else:
        subprocess.Popen(["xdg-open", LOG_DIR])


def check_status(icon, item):
    """检查服务状态"""
    import urllib.request
    status = []
    try:
        r = urllib.request.urlopen(f"http://127.0.0.1:{API_PORT}/api/status", timeout=3)
        status.append("后端: 运行中")
    except:
        status.append("后端: 未运行")
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{WEB_PORT}", timeout=3)
        status.append("前端: 运行中")
    except:
        status.append("前端: 未运行")
    # 显示消息框
    if sys.platform == "win32":
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, "\n".join(status), "服务状态", 0x40)


def quit_all(icon, item):
    """全部退出"""
    global proc_backend, proc_frontend, stop_event
    log("正在退出...")
    stop_event.set()

    # 杀掉后端
    if proc_backend and proc_backend.poll() is None:
        log("停止后端...")
        try:
            proc_backend.terminate()
            proc_backend.wait(timeout=5)
        except:
            try:
                proc_backend.kill()
            except:
                pass

    # 杀掉前端（npm进程及其子进程）
    if proc_frontend and proc_frontend.poll() is None:
        log("停止前端...")
        try:
            if sys.platform == "win32":
                # Windows下杀掉npm进程树
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc_frontend.pid)],
                              capture_output=True)
            else:
                proc_frontend.terminate()
                proc_frontend.wait(timeout=5)
        except:
            try:
                proc_frontend.kill()
            except:
                pass

    # 额外清理：杀掉占用8765和3000端口的进程
    if sys.platform == "win32":
        try:
            for port in [API_PORT, WEB_PORT]:
                result = subprocess.run(
                    ["netstat", "-ano"], capture_output=True, text=True
                )
                for line in result.stdout.splitlines():
                    if f":{port}" in line and "LISTENING" in line:
                        pid = line.strip().split()[-1]
                        if pid and pid != "0":
                            subprocess.run(["taskkill", "/F", "/PID", pid],
                                          capture_output=True)
                            log(f"清理端口{port}进程 PID={pid}")
        except:
            pass

    log("已全部退出")
    icon.stop()
    sys.exit(0)


def create_tray_icon():
    """创建托盘图标"""
    try:
        from PIL import Image, ImageDraw
        import pystray

        # 绘制一个简单的图标（蓝色圆形+白色大象轮廓）
        img = Image.new('RGB', (64, 64), color="#1a73e8")
        draw = ImageDraw.Draw(img)
        # 画一个白色圆形作为标识
        draw.ellipse([12, 12, 52, 52], fill="white", outline="#1a73e8", width=2)
        draw.ellipse([24, 20, 40, 36], fill="#1a73e8")  # 眼睛
        draw.arc([20, 30, 44, 50], 0, 180, fill="#1a73e8", width=3)  # 鼻子

        menu = pystray.Menu(
            pystray.MenuItem("打开程序界面", open_web, default=True),
            pystray.MenuItem("检查服务状态", check_status),
            pystray.MenuItem("打开日志文件夹", open_logs),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("全部退出", quit_all),
        )

        icon = pystray.Icon(
            "elephant_detect",
            img,
            "天眼护象 - 目标检测系统",
            menu
        )
        return icon
    except Exception as e:
        log(f"创建托盘图标失败: {e}")
        return None


def main():
    """主函数"""
    log("=" * 50)
    log("天眼护象 - 桌面启动器启动")
    log(f"项目目录: {BASE_DIR}")
    log("=" * 50)

    # 检查必要文件
    if not os.path.exists(BACKEND_SCRIPT):
        log(f"错误: 找不到后端脚本 {BACKEND_SCRIPT}")
        if sys.platform == "win32":
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, f"找不到后端脚本:\n{BACKEND_SCRIPT}", "启动失败", 0x10)
        sys.exit(1)

    # 启动后端
    if not start_backend():
        log("后端启动失败，退出")
        sys.exit(1)

    # 启动前端
    if not start_frontend():
        log("前端启动失败，但后端已启动")

    # 等待服务就绪
    wait_for_services()

    # 创建托盘图标
    icon = create_tray_icon()
    if icon:
        log("托盘图标已创建，右键托盘图标可管理程序")
        log("双击托盘图标打开网页界面")
        # 自动打开网页
        time.sleep(2)
        webbrowser.open(f"http://127.0.0.1:{WEB_PORT}")
        icon.run()
    else:
        log("托盘图标创建失败，服务仍在后台运行")
        log(f"请手动打开浏览器访问: http://127.0.0.1:{WEB_PORT}")
        # 保持运行
        try:
            while not stop_event.is_set():
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        quit_all(None, None)


if __name__ == "__main__":
    main()

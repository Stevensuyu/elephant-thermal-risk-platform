@echo off
chcp 65001 >nul
title 天眼护象 - 目标检测系统
echo ========================================
echo   天眼护象 - 目标检测系统 启动中...
echo ========================================
echo.

cd /d "%~dp0"

REM 检查虚拟环境
if not exist ".venv\Scripts\python.exe" (
    echo [错误] 找不到虚拟环境 .venv\Scripts\python.exe
    pause
    exit /b 1
)

REM 检查守护进程脚本
if not exist "worker\detect\watchdog.py" (
    echo [错误] 找不到守护进程脚本 worker\detect\watchdog.py
    pause
    exit /b 1
)

echo [1/3] 启动后端守护进程（自动监控+卡死重启）...
start "" /B ".venv\Scripts\python.exe" "worker\detect\watchdog.py"
timeout /t 8 /nobreak >nul

echo [2/3] 启动前端Web服务...
start "" /B cmd /c "npm run start"
timeout /t 10 /nobreak >nul

echo [3/3] 打开浏览器...
start "" "http://127.0.0.1:3000"

echo.
echo ========================================
echo   系统已启动！
echo   前端: http://127.0.0.1:3000
echo   后端: http://127.0.0.1:8765
echo.
echo   守护进程会自动监控后端，卡死自动重启
echo   关闭此窗口不会停止服务
echo   如需停止，请运行 停止系统.bat
echo ========================================
echo.
pause

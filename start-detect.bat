@echo off
chcp 65001 >nul
title 天眼护象 - 检测服务
echo ========================================
echo   天眼护象 - 检测服务启动中
echo ========================================
echo.

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo [错误] 未找到虚拟环境 .venv\Scripts\python.exe
    echo 请先运行: python -m venv .venv
    pause
    exit /b 1
)

echo [信息] 启动检测服务...
echo [信息] 服务地址: http://127.0.0.1:8765
echo [信息] 按 Ctrl+C 停止服务
echo.

".venv\Scripts\python.exe" "worker\detect\run.py"

echo.
echo [信息] 检测服务已停止
pause

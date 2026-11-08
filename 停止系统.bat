@echo off
chcp 65001 >nul
title 停止天眼护象系统
echo ========================================
echo   正在停止天眼护象系统...
echo ========================================
echo.

echo [1/2] 停止后端检测服务...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8765" ^| findstr "LISTENING"') do (
    echo   杀掉进程 PID=%%a
    taskkill /F /PID %%a >nul 2>&1
)

echo [2/2] 停止前端Web服务...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo   杀掉进程 PID=%%a
    taskkill /F /PID %%a >nul 2>&1
)

REM 额外杀掉node和python进程
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo   系统已停止！
echo ========================================
echo.
pause

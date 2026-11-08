# 天眼护象 · 本地检测服务一键环境搭建（Windows PowerShell）
# 用法: powershell -ExecutionPolicy Bypass -File detect_setup.ps1
# 内容: 创建 .venv + 安装 CUDA 版 PyTorch + 最新版 ultralytics + LocateAnything 依赖
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "== 1/3 创建虚拟环境 .venv ==" -ForegroundColor Cyan
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    py -3.13 -m venv .venv
}
$py = "$PSScriptRoot\.venv\Scripts\python.exe"

Write-Host "== 2/3 安装 CUDA 版 PyTorch（RTX 50 系 Blackwell, cu128）与最新版 ultralytics ==" -ForegroundColor Cyan
& $py -m pip install --upgrade pip --quiet
& $py -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
& $py -m pip install "ultralytics>=8.4.0" opencv-python numpy pillow requests

Write-Host "== 3/3 安装英伟达 LocateAnything-3B 依赖 ==" -ForegroundColor Cyan
& $py -m pip install "transformers==4.57.1" peft lmdb "decord>=0.6.0" "pillow>=10.0.0"
# int8/int4 量化可选（显存不足时自动使用）
& $py -m pip install bitsandbytes 2>$null

Write-Host "完成。启动服务: start-detect.bat" -ForegroundColor Green

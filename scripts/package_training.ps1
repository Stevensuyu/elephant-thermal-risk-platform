param(
  [switch]$IncludeData,
  [string]$Output = "dist\elephant-yolo-training-package.zip"
)

$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$staging = Join-Path $repo "dist\training-package"
$zipPath = Join-Path $repo $Output

if (Test-Path $staging) {
  $resolved = Resolve-Path $staging
  if (-not $resolved.Path.StartsWith((Join-Path $repo "dist"))) {
    throw "Refusing to clean unexpected staging path: $resolved"
  }
  Remove-Item -LiteralPath $resolved.Path -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $staging | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $zipPath) | Out-Null

$files = @(
  "requirements-training.txt",
  "prepare_elephant_multisource_thermal_yolo.py",
  "scripts\download_training_materials.py",
  "scripts\video_to_yolo_dataset.py",
  "scripts\run_training.sh",
  "train_elephant_yolo.py",
  "train_elephant_multisource_thermal_yolo.py",
  "data\elephant_multisource_thermal.yaml",
  "notebooks\elephant_yolo_training.ipynb",
  "docs\模型训练使用指南.md",
  "ELEPHANT_THERMAL_TRAINING_REPORT.md"
)

foreach ($file in $files) {
  $source = Join-Path $repo $file
  if (Test-Path $source) {
    $target = Join-Path $staging $file
    New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Force
  }
}

$bestWeights = Join-Path $repo "runs\detect\runs\elephant_multisource_thermal\yolov8n_elephant_multisource_8e\weights\best.pt"
if (Test-Path $bestWeights) {
  $target = Join-Path $staging "runs\detect\runs\elephant_multisource_thermal\yolov8n_elephant_multisource_8e\weights\best.pt"
  New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
  Copy-Item -LiteralPath $bestWeights -Destination $target -Force
}

if ($IncludeData) {
  foreach ($folder in @("downloads", "data\elephant_multisource_thermal")) {
    $source = Join-Path $repo $folder
    if (Test-Path $source) {
      $target = Join-Path $staging $folder
      New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
      Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
    }
  }
}

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -Force
Write-Host "Training package created: $zipPath"
if (-not $IncludeData) {
  Write-Host "Data folders were not included. Run with -IncludeData for offline upload mode."
}

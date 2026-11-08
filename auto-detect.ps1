# Auto start detection after detect service is ready.
# Pick the Pocket/Osmo camera if present, otherwise the first available camera.
$base = "http://127.0.0.1:8765"

for ($i = 0; $i -lt 40; $i++) {
  try {
    $null = Invoke-RestMethod -Uri "$base/api/status" -TimeoutSec 3
    break
  } catch {
    Start-Sleep -Seconds 3
  }
}

try {
  $cams = Invoke-RestMethod -Uri "$base/api/cameras?refresh=1" -TimeoutSec 120
} catch {
  exit 0
}

if (-not $cams.devices -or $cams.devices.Count -eq 0) {
  exit 0
}

$dev = $null
foreach ($d in $cams.devices) {
  if ($d.label -match 'pocket|osmo') { $dev = $d; break }
}
if (-not $dev) { $dev = $cams.devices[0] }

try {
  $body = @{ type = 'webcam'; index = [int]$dev.index } | ConvertTo-Json
  $null = Invoke-RestMethod -Uri "$base/api/source/select" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 90
  $null = Invoke-RestMethod -Uri "$base/api/detection/start" -Method Post -Body '{}' -ContentType 'application/json' -TimeoutSec 90
} catch {
  exit 0
}

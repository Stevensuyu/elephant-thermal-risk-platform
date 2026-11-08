param(
  [switch]$Production = $true
)

$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repo

Write-Host "Checking JavaScript..."
npm run check

Write-Host "Building dist-site..."
npm run build

Write-Host "Checking Vercel login..."
$whoami = $null
try {
  $whoami = npx vercel whoami 2>$null
} catch {
  $whoami = $null
}

if (-not $whoami) {
  Write-Host "Please sign in to Vercel in the browser window."
  npx vercel login
}

if (-not (Test-Path ".vercel\project.json")) {
  Write-Host "Linking Vercel project..."
  npx vercel link
}

if ($Production) {
  npx vercel --prod
} else {
  npx vercel
}

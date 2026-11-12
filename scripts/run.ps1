# Start the local server and open the UI in the default browser.
# Usage: run.ps1 [-Port 8000] [-NoBrowser]
param(
    [int]$Port = 8000,
    [switch]$NoBrowser
)
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "Virtual environment not found. Run setup.bat first." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path "frontend\dist\index.html")) {
    Write-Host "Frontend not built. Run setup.bat first." -ForegroundColor Red
    exit 1
}
$url = "http://127.0.0.1:$Port"
if (-not $NoBrowser) {
    # Open the browser once the server answers, instead of guessing a delay.
    $opener = "for (`$i = 0; `$i -lt 60; `$i++) { try { Invoke-WebRequest -UseBasicParsing '$url/api/health' | Out-Null; Start-Process '$url'; break } catch { Start-Sleep -Milliseconds 500 } }"
    Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile", "-Command", $opener
}
Write-Host "Stem Separator running at $url  (Ctrl+C to stop)"
& $python -m uvicorn backend.app:app --host 127.0.0.1 --port $Port

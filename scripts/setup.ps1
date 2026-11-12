# One-time setup: Python venv + dependencies, npm install, frontend build.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Step([string]$label, [scriptblock]$cmd) {
    Write-Host ""
    Write-Host "==> $label"
    & $cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $label (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Invoke-Step "Creating Python 3.10 virtual environment" { py -3.10 -m venv .venv }
}
$python = Join-Path $root ".venv\Scripts\python.exe"
Invoke-Step "Upgrading pip" { & $python -m pip install --upgrade pip }
Invoke-Step "Installing PyTorch (CPU) and Demucs - this downloads about 1 GB" {
    & $python -m pip install -r backend\requirements.txt
}

Set-Location (Join-Path $root "frontend")
Invoke-Step "Installing frontend dependencies" { npm install --no-audit --no-fund }
Invoke-Step "Building the web UI" { npm run build }
Set-Location $root

Write-Host ""
Write-Host "Setup complete. Start the app with run.bat (or scripts\run.ps1)." -ForegroundColor Green

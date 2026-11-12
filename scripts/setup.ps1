# One-time setup: checks prerequisites, creates a Python virtual environment,
# installs PyTorch (CPU) + Demucs, installs frontend packages and builds the UI.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$SupportedPython = @("3.12", "3.13", "3.11", "3.10")   # preference order

function Fail([string]$message) {
    Write-Host ""
    Write-Host $message -ForegroundColor Red
    exit 1
}

function Invoke-Step([string]$label, [scriptblock]$cmd) {
    Write-Host ""
    Write-Host "==> $label" -ForegroundColor Cyan
    & $cmd
    if ($LASTEXITCODE -ne 0) {
        Fail "FAILED: $label (exit code $LASTEXITCODE). See the README's Troubleshooting section."
    }
}

Write-Host "Stem Separator setup" -ForegroundColor Green

# --- Prerequisite: Python 3.10-3.13 via the py launcher -------------------
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
        Fail ("Python was not found.`n" +
              "Install Python 3.12 from https://www.python.org/downloads/ (tick 'Add python.exe to PATH'),`n" +
              "or run:  winget install Python.Python.3.12`n" +
              "Then close this window and run setup.bat again.")
    }
    $chosen = $null
    foreach ($v in $SupportedPython) {
        # Probe through cmd so "not found" output stays silent and can't trip $ErrorActionPreference.
        cmd /c "py -$v -c ""import sys"" >nul 2>&1"
        if ($LASTEXITCODE -eq 0) { $chosen = $v; break }
    }
    if (-not $chosen) {
        $found = ((cmd /c "py -0 2>&1") | Where-Object { $_ -match "\S" } | ForEach-Object { $_.Trim() }) -join ", "
        Fail ("No supported Python version found (need 3.10, 3.11, 3.12 or 3.13; found: $found).`n" +
              "Install Python 3.12 with:  winget install Python.Python.3.12`n" +
              "Then close this window and run setup.bat again.")
    }
    Invoke-Step "Creating Python $chosen virtual environment (.venv)" { py "-$chosen" -m venv .venv }
} else {
    Write-Host "Using existing virtual environment (.venv)."
}

# --- Prerequisite: Node.js 18+ --------------------------------------------
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail ("Node.js was not found.`n" +
          "Install the LTS version from https://nodejs.org/ or run:  winget install OpenJS.NodeJS.LTS`n" +
          "Then close this window and run setup.bat again.")
}
$nodeMajor = [int]((node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 18) {
    Fail "Node.js 18 or newer is required (found $(node --version)). Install the LTS version from https://nodejs.org/"
}

# --- Install -----------------------------------------------------------------
Invoke-Step "Upgrading pip" { & $venvPython -m pip install --upgrade pip --quiet }
Invoke-Step "Installing PyTorch (CPU) and Demucs - about 1 GB, this can take several minutes" {
    & $venvPython -m pip install -r backend\requirements.txt
}

Set-Location (Join-Path $root "frontend")
Invoke-Step "Installing frontend packages" { npm install --no-audit --no-fund }
Invoke-Step "Building the web interface" { npm run build }
Set-Location $root

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Double-click run.bat to start Stem Separator."

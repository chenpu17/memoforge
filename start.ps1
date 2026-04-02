$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$FrontendDir = Join-Path $ProjectRoot "frontend"
$TauriConfig = Join-Path $ProjectRoot "crates\memoforge-tauri\tauri.conf.json"
$LocalTauriCli = Join-Path $FrontendDir "node_modules\.bin\tauri.cmd"

function Test-Command {
    param([string]$Name)

    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-CargoTauri {
    try {
        & cargo tauri --version *> $null
        return $true
    } catch {
        return $false
    }
}

function Wait-Url {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
            return
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }

    throw "Timed out waiting for $Url"
}

if (-not (Test-Command "node")) {
    throw "Node.js is required."
}

if (-not (Test-Command "cargo")) {
    throw "Rust/Cargo is required."
}

if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Write-Host "Installing frontend dependencies..."
    & npm.cmd install --prefix $FrontendDir
}

$vite = $null
try {
    Write-Host "Starting frontend dev server on http://127.0.0.1:1420 ..."
    $vite = Start-Process -FilePath "npm.cmd" `
        -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", "1420" `
        -WorkingDirectory $FrontendDir `
        -PassThru

    Wait-Url -Url "http://127.0.0.1:1420"

    if (Test-Path $LocalTauriCli) {
        Write-Host "Starting Tauri via local CLI..."
        & $LocalTauriCli dev -c $TauriConfig --no-watch
    } elseif (Test-CargoTauri) {
        Write-Host "Starting Tauri via cargo-tauri..."
        & cargo tauri dev
    } else {
        throw "Missing Tauri CLI. Install frontend dependencies or run 'cargo install tauri-cli --version ^2.0'."
    }
} finally {
    if ($vite -and (Get-Process -Id $vite.Id -ErrorAction SilentlyContinue)) {
        Stop-Process -Id $vite.Id -Force
    }
}

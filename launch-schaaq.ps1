# Schaaq Scanner Launcher
# Starts the server and opens the browser

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Check if UI is built
if (-not (Test-Path "ui\dist\index.html")) {
    Write-Host "Building Schaaq Scanner UI..." -ForegroundColor Yellow
    Push-Location ui
    npm run build
    Pop-Location
}

# Kill any existing Schaaq process on port 3000
$existing = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Stopping existing Schaaq instance..." -ForegroundColor Yellow
    Stop-Process -Id (Get-Process -Id $existing.OwningProcess).Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# Locate npx
# npx called via cmd.exe

# Start the server in the background
Write-Host "Starting Schaaq Scanner..." -ForegroundColor Green
$process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx tsx src/cli.ts ui --port 3000" -WindowStyle Hidden -PassThru

# Wait for server to be ready
$maxWait = 15
$waited = 0
while ($waited -lt $maxWait) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) { break }
    } catch {
        Start-Sleep -Milliseconds 500
        $waited += 0.5
    }
}

if ($waited -ge $maxWait) {
    Write-Host "ERROR: Server failed to start within ${maxWait}s" -ForegroundColor Red
    if ($process -and !$process.HasExited) { $process.Kill() }
    exit 1
}

# Open browser
Start-Process "http://localhost:3000"
Write-Host ""
Write-Host "Schaaq Scanner is running at http://localhost:3000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop, or close this window." -ForegroundColor DarkGray
Write-Host ""

# Keep alive - when this script exits, kill the server
try {
    Wait-Process -Id $process.Id
} finally {
    if (!$process.HasExited) { $process.Kill() }
}

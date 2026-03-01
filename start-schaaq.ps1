Set-Location "C:\Users\Lenovo\OneDrive\Desktop\projects\dalc-scanner"

$job = Start-Job -ScriptBlock {
    Set-Location "C:\Users\Lenovo\OneDrive\Desktop\projects\dalc-scanner"
    npm run dev 2>&1
}

Start-Sleep -Seconds 4
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "  Schaaq Scanner running on http://localhost:5173 -- Press Enter to stop." -ForegroundColor Cyan
Write-Host ""

Read-Host | Out-Null

Stop-Job $job -ErrorAction SilentlyContinue
Remove-Job $job -Force -ErrorAction SilentlyContinue

# Kill any lingering child processes (node, vite, tsx)
Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -eq "" -or $_.Path -like "*dalc-scanner*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "  Schaaq Scanner stopped." -ForegroundColor Yellow

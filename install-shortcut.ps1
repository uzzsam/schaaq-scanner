# Creates a desktop shortcut for Schaaq Scanner
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "Schaaq Scanner.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = Join-Path $ScriptDir "Schaaq.vbs"
$Shortcut.WorkingDirectory = $ScriptDir
$Shortcut.Description = "Launch Schaaq Scanner"

# Use the icon if it exists
$iconPath = Join-Path $ScriptDir "schaaq.ico"
if (Test-Path $iconPath) {
    $Shortcut.IconLocation = $iconPath
}

$Shortcut.Save()
Write-Host "Desktop shortcut created: $ShortcutPath" -ForegroundColor Green

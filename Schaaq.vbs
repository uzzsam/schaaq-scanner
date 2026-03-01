Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -ExecutionPolicy Bypass -File """ & Replace(WScript.ScriptFullName, "Schaaq.vbs", "launch-schaaq.ps1") & """", 0, False

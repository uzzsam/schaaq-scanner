# Generates the rest of the test file

function AppendToFile([string]) {
  Add-Content -Path "C:UsersLenovoOneDriveDesktopprojectsdalc-scanner	ests	ransformschecks.test.ts" -Value  -Encoding UTF8
}

Write-Output "Starting..."

# Test
AppendToFile "// test line"

Write-Output "Done"

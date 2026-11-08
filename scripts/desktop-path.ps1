# Prints the current user's Desktop directory (one line, UTF-8 via console).
$ErrorActionPreference = "Stop"
try {
  $desktop = [Environment]::GetFolderPath("Desktop")
  if (-not $desktop) { $desktop = Join-Path $env:USERPROFILE "Desktop" }
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $desktop
} catch {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output (Join-Path $env:USERPROFILE "Desktop")
}

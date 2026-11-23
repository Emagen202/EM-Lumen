<#
  EM Lumen — install the server as an auto-restarting Windows service (run as Administrator).

  Preferred: NSSM (https://nssm.cc) — put nssm.exe next to this script or in PATH.
  Fallback:  a scheduled task at system startup that runs run-forever.ps1 (restarts node if it exits).

  Usage: powershell -ExecutionPolicy Bypass -File deploy\windows\install-service.ps1
#>
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "Node.js 22+ is not installed (https://nodejs.org)." }
$ver = (& $node -v).TrimStart('v').Split('.')
if ([int]$ver[0] -lt 22 -or ([int]$ver[0] -eq 22 -and [int]$ver[1] -lt 13)) { throw "Node.js 22.13 or newer is required (found $(& $node -v))." }
if (-not (Test-Path (Join-Path $root ".env"))) { Write-Warning "No .env file yet — copy .env.example to .env and fill it in." }

$nssm = (Get-Command nssm -ErrorAction SilentlyContinue).Source
if (-not $nssm -and (Test-Path (Join-Path $PSScriptRoot "nssm.exe"))) { $nssm = Join-Path $PSScriptRoot "nssm.exe" }

if ($nssm) {
  Write-Host "Installing service 'EM-Lumen' with NSSM..."
  & $nssm stop EM-Lumen 2>$null | Out-Null
  & $nssm remove EM-Lumen confirm 2>$null | Out-Null
  & $nssm install EM-Lumen $node "--disable-warning=ExperimentalWarning" "server\index.js"
  & $nssm set EM-Lumen AppDirectory $root
  & $nssm set EM-Lumen DisplayName "EM Lumen signage server"
  & $nssm set EM-Lumen Start SERVICE_AUTO_START
  & $nssm set EM-Lumen AppExit Default Restart
  & $nssm set EM-Lumen AppRestartDelay 3000
  & $nssm set EM-Lumen AppStdout (Join-Path $root "data\logs\service.out.log")
  & $nssm set EM-Lumen AppStderr (Join-Path $root "data\logs\service.err.log")
  & $nssm set EM-Lumen AppRotateFiles 1
  & $nssm set EM-Lumen AppRotateBytes 10485760
  New-Item -ItemType Directory -Force -Path (Join-Path $root "data\logs") | Out-Null
  & $nssm start EM-Lumen
} else {
  Write-Host "NSSM not found — creating startup task 'EM-Lumen Server' instead..."
  $runner = Join-Path $PSScriptRoot "run-forever.ps1"
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`"" -WorkingDirectory $root
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName "EM-Lumen Server" -Action $action -Trigger $trigger -Settings $settings -User "SYSTEM" -RunLevel Highest -Force | Out-Null
  Start-ScheduledTask -TaskName "EM-Lumen Server"
}
Start-Sleep 3
$port = 8080
$envLine = Get-Content (Join-Path $root ".env") -ErrorAction SilentlyContinue | Select-String '^PORT=(\d+)' | Select-Object -First 1
if ($envLine) { $port = $envLine.Matches[0].Groups[1].Value }
try { $h = Invoke-RestMethod "http://127.0.0.1:$port/healthz" -TimeoutSec 5; Write-Host "Server is up: v$($h.version)" -ForegroundColor Green }
catch { Write-Warning "Health check failed — see data\logs." }

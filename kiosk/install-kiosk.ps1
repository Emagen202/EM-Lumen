<#
  EM Lumen - one-time setup of the lobby screen PC (run as Administrator).
  - Starts the kiosk launcher at user logon (scheduled task, restarts on failure)
  - Disables sleep, monitor timeout and screensaver
  - Optionally schedules a nightly reboot for long-term stability

  Usage:  powershell -ExecutionPolicy Bypass -File .\install-kiosk.ps1 [-NightlyReboot "04:45"]
#>
param(
  [string]$NightlyReboot = ""
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$bat = Join-Path $here "start-kiosk.bat"
if (-not (Test-Path $bat)) { throw "start-kiosk.bat not found next to this script." }
if ((Get-Content (Join-Path $here "kiosk.ps1") -Raw) -match "PUT-SCREEN-KEY-HERE") { Write-Warning 'Edit $PlayerUrl in kiosk.ps1 first (copy the address from the admin, Screens page).' }

Write-Host "Creating logon task 'EM-Lumen Kiosk'..."
$action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$bat`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName "EM-Lumen Kiosk" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "Disabling sleep / monitor timeout..."
powercfg /change monitor-timeout-ac 0
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /hibernate off 2>$null
Set-ItemProperty -Path "HKCU:\Control Panel\Desktop" -Name ScreenSaveActive -Value 0

if ($NightlyReboot -ne "") {
  Write-Host "Scheduling nightly reboot at $NightlyReboot..."
  $ra = New-ScheduledTaskAction -Execute "shutdown.exe" -Argument "/r /f /t 60 /c `"EM-Lumen nightly restart`""
  $rt = New-ScheduledTaskTrigger -Daily -At $NightlyReboot
  Register-ScheduledTask -TaskName "EM-Lumen Nightly Reboot" -Action $ra -Trigger $rt -User "SYSTEM" -RunLevel Highest -Force | Out-Null
}

Write-Host ""
Write-Host "Done. Recommended manual steps:" -ForegroundColor Green
Write-Host " 1. Enable automatic sign-in for this kiosk user (netplwiz or Sysinternals Autologon)."
Write-Host " 2. In BIOS: 'Restore on AC power loss' = Power On."
Write-Host " 3. Windows Update: set active hours to cover the opening hours."
Write-Host " 4. Sign out and back in to test. Press 'i' on the screen for player diagnostics."

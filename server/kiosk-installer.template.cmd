<# : EM Lumen kiosk installer (batch header - do not edit)
@echo off
setlocal
title EM Lumen - kiosk installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$env:EMTV_SELF='%~f0'; $env:EMTV_ARG='%~1'; Invoke-Expression ([IO.File]::ReadAllText('%~f0'))"
exit /b %errorlevel%
#>
# ============================================================================
#  EM Lumen - kiosk installer for screen: __SCREEN__
#  Double-click to install. Run with argument "uninstall" to remove.
#  The display address below is permanent - it never needs to be changed.
# ============================================================================
$PlayerUrl = '__PLAYER_URL__'
$StatusUrl = '__STATUS_URL__'
$ErrorActionPreference = 'Stop'

$self = $env:EMTV_SELF
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'Requesting administrator rights...'
  Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c ""' + $self + '" ' + $env:EMTV_ARG + '"') -Verb RunAs
  exit 0
}

$Dir = Join-Path $env:ProgramData 'EM-Lumen'
$Watchdog = Join-Path $Dir 'kiosk.ps1'
$TaskName = 'EM-Lumen Kiosk'
# The task runs for the user who launched the installer (the account that will be signed in on the screen).
$KioskUser = (Get-CimInstance Win32_ComputerSystem).UserName
if (-not $KioskUser) { $KioskUser = "$env:USERDOMAIN\$env:USERNAME" }

if ($env:EMTV_ARG -eq 'uninstall') {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*EM-Lumen\kiosk.ps1*' -or $_.CommandLine -like '*EM-Lumen\browser-profile*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }
  Remove-Item -Recurse -Force $Dir -ErrorAction SilentlyContinue
  Write-Host 'EM Lumen kiosk removed.' -ForegroundColor Green
  Start-Sleep 4; exit 0
}

New-Item -ItemType Directory -Force -Path $Dir | Out-Null

# ---------------------------------------------------------------- watchdog (runs at every logon)
$watchdogCode = @'
$PlayerUrl = '__PLAYER_URL__'
$StatusUrl = '__STATUS_URL__'
$CheckEverySeconds = 20
$HeartbeatStaleSeconds = 180
$Base = Join-Path $env:LOCALAPPDATA 'EM-Lumen'
$KioskProfile = Join-Path $Base 'browser-profile'
$LogFile = Join-Path $Base 'kiosk.log'
New-Item -ItemType Directory -Force -Path $KioskProfile | Out-Null
function Log($m) { try { if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 2MB) { Remove-Item $LogFile -Force }; "$(Get-Date -Format s) $m" | Out-File -Append -Encoding utf8 $LogFile } catch {} }

$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$Browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Browser) { Log 'No Chrome/Edge found'; exit 1 }
$ExeName = [IO.Path]::GetFileName($Browser)
$BrowserArgs = @(
  '--kiosk', "`"$PlayerUrl`"", "--user-data-dir=`"$KioskProfile`"",
  '--no-first-run', '--no-default-browser-check', '--noerrdialogs',
  '--disable-session-crashed-bubble', '--disable-infobars',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-features=Translate,TranslateUI,MediaRouter',
  '--overscroll-history-navigation=0', '--disable-pinch',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--check-for-update-interval=31536000'
)
function Get-KioskProcesses { Get-CimInstance Win32_Process -Filter "Name='$ExeName'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*EM-Lumen\browser-profile*' } }
function Clear-CrashFlag {
  $prefs = Join-Path $KioskProfile 'Default\Preferences'
  if (Test-Path $prefs) { try { (Get-Content $prefs -Raw) -replace '"exit_type":"Crashed"', '"exit_type":"Normal"' -replace '"exited_cleanly":false', '"exited_cleanly":true' | Set-Content $prefs -Encoding utf8 } catch {} }
}
function Start-Kiosk { Clear-CrashFlag; Log "starting $ExeName"; Start-Process -FilePath $Browser -ArgumentList $BrowserArgs | Out-Null; $script:StartedAt = Get-Date }
function Stop-Kiosk { Get-KioskProcesses | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }; Start-Sleep 3 }

# Only one watchdog per user session.
$mutex = New-Object System.Threading.Mutex($false, 'Local\EM-Lumen-Kiosk')
if (-not $mutex.WaitOne(0)) { exit 0 }

$StartedAt = Get-Date
Log "kiosk watchdog started ($PlayerUrl)"
while ($true) {
  try {
    if (-not (Get-KioskProcesses)) { Start-Kiosk }
    elseif (((Get-Date) - $StartedAt).TotalSeconds -gt 240) {
      try {
        $st = Invoke-RestMethod -Uri $StatusUrl -TimeoutSec 10 -UseBasicParsing
        if ($st.ageSeconds -ne $null -and $st.ageSeconds -gt $HeartbeatStaleSeconds) {
          Log "page heartbeat is $($st.ageSeconds)s old while the server is reachable -> restarting browser"
          Stop-Kiosk; Start-Kiosk
        }
      } catch { }  # server unreachable: the player keeps running offline
    }
  } catch { Log "watchdog error: $_" }
  Start-Sleep -Seconds $CheckEverySeconds
}
'@
Set-Content -Path $Watchdog -Value $watchdogCode -Encoding UTF8

# ---------------------------------------------------------------- autostart at logon
Write-Host "Installing autostart for $KioskUser ..."
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Watchdog`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $KioskUser
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $KioskUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

# ---------------------------------------------------------------- never sleep / blank the screen
Write-Host 'Disabling sleep and screen timeout...'
powercfg /change monitor-timeout-ac 0 | Out-Null
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
try { powercfg /hibernate off | Out-Null } catch {}
try { Set-ItemProperty -Path 'HKCU:\Control Panel\Desktop' -Name ScreenSaveActive -Value 0 } catch {}

# ---------------------------------------------------------------- start now
Start-ScheduledTask -TaskName $TaskName
Write-Host ''
Write-Host 'Done. The screen will open in a few seconds and will start automatically after every restart.' -ForegroundColor Green
Write-Host 'Recommended once: enable automatic sign-in for this Windows user (netplwiz), and in BIOS set "Restore on AC power loss" = Power On.'
Write-Host 'To remove: run this file with the argument "uninstall".'
Start-Sleep 8

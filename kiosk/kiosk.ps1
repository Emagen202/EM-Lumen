<#
  EM Lumen - kiosk watchdog for the lobby screen PC (Windows).
  - Opens the player full screen in Chrome (or Edge) with a dedicated profile
  - Restarts the browser if it is closed or crashes
  - Restarts the browser if the page stops sending heartbeats (frozen tab / "Aw, Snap")
    while the server itself is reachable
#>
$PlayerUrl = "https://lumen.example.com/player/PUT-SCREEN-KEY-HERE"
$CheckEverySeconds = 20
$HeartbeatStaleSeconds = 180

$KioskProfile = Join-Path $env:LOCALAPPDATA "EM-Lumen\browser-profile"
$LogFile = Join-Path $env:LOCALAPPDATA "EM-Lumen\kiosk.log"
New-Item -ItemType Directory -Force -Path $KioskProfile | Out-Null

function Log($msg) { "$(Get-Date -Format s) $msg" | Out-File -Append -Encoding utf8 $LogFile }

$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$Browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Browser) { Log "No Chrome/Edge found"; exit 1 }
$ExeName = [IO.Path]::GetFileName($Browser)

$BrowserArgs = @(
  "--kiosk", "`"$PlayerUrl`"", "--user-data-dir=`"$KioskProfile`"",
  "--no-first-run", "--no-default-browser-check", "--noerrdialogs",
  "--disable-session-crashed-bubble", "--disable-infobars",
  "--autoplay-policy=no-user-gesture-required",
  "--disable-features=Translate,TranslateUI,MediaRouter",
  "--overscroll-history-navigation=0", "--disable-pinch",
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
  "--check-for-update-interval=31536000"
)

# Status endpoint: https://host/player/KEY  ->  https://host/api/player/KEY/status
$uri = [Uri]$PlayerUrl
$key = $uri.Segments[-1].Trim('/')
$StatusUrl = "$($uri.Scheme)://$($uri.Authority)/api/player/$key/status"

function Get-KioskProcesses {
  Get-CimInstance Win32_Process -Filter "Name='$ExeName'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*EM-Lumen\browser-profile*" }
}
function Clear-CrashFlag {
  $prefs = Join-Path $KioskProfile "Default\Preferences"
  if (Test-Path $prefs) {
    try { (Get-Content $prefs -Raw) -replace '"exit_type":"Crashed"', '"exit_type":"Normal"' -replace '"exited_cleanly":false', '"exited_cleanly":true' | Set-Content $prefs -Encoding utf8 } catch {}
  }
}
function Start-Kiosk { Clear-CrashFlag; Log "starting $ExeName"; Start-Process -FilePath $Browser -ArgumentList $BrowserArgs | Out-Null; $script:StartedAt = Get-Date }
function Stop-Kiosk { Get-KioskProcesses | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }; Start-Sleep 3 }

$StartedAt = Get-Date
Log "kiosk watchdog started ($PlayerUrl)"
while ($true) {
  try {
    if (-not (Get-KioskProcesses)) { Start-Kiosk }
    elseif (((Get-Date) - $StartedAt).TotalSeconds -gt 240) {
      try {
        $st = Invoke-RestMethod -Uri $StatusUrl -TimeoutSec 10 -UseBasicParsing
        if ($st.ageSeconds -ne $null -and $st.ageSeconds -gt $HeartbeatStaleSeconds) {
          Log "page heartbeat is $($st.ageSeconds)s old while server is reachable -> restarting browser"
          Stop-Kiosk; Start-Kiosk
        }
      } catch { <# server unreachable: the player keeps running offline, do nothing #> }
    }
  } catch { Log "watchdog error: $_" }
  Start-Sleep -Seconds $CheckEverySeconds
}

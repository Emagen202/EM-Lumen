# Keeps the EM Lumen server running: restarts node whenever it exits (used when NSSM is not available).
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root
$logDir = Join-Path $root "data\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
while ($true) {
  "$(Get-Date -Format s) starting server" | Out-File -Append (Join-Path $logDir "runner.log")
  & node --disable-warning=ExperimentalWarning server\index.js *>> (Join-Path $logDir "service.out.log")
  "$(Get-Date -Format s) server exited with code $LASTEXITCODE, restarting in 3s" | Out-File -Append (Join-Path $logDir "runner.log")
  Start-Sleep -Seconds 3
}

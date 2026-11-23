@echo off
REM ==================================================================
REM  EM Lumen - kiosk launcher for the lobby screen PC (Windows)
REM  Edit PLAYER_URL inside kiosk.ps1, then run install-kiosk.ps1 once.
REM ==================================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0kiosk.ps1"

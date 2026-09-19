@echo off
setlocal
cd /d "%~dp0"
title Stellar Nexus - Galaxien-Demo
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Demo.ps1"
if errorlevel 1 (
  echo.
  echo Die Demo konnte nicht gestartet werden. Details: start-demo.log
  pause
)

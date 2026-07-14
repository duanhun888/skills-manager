@echo off
REM Double-click or run in cmd. Opens Admin PowerShell and keeps window open.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -Wait -WorkingDirectory '%CD%' -ArgumentList '-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-File','%~dp0scripts\tauri-build.ps1','-SkipElevate'"
pause

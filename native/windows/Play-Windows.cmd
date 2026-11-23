@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Scripts\Play-Windows.ps1"
if errorlevel 1 (
    echo.
    echo Steel Front could not start. See the error above and README.md.
    pause
    exit /b 1
)

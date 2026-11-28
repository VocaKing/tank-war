@echo off
setlocal
set "SCRIPT=%~dp0build-is2-windows.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
set "CODE=%ERRORLEVEL%"
echo.
if "%CODE%"=="0" (
  echo IS-2 Blender build finished. Your preview folder should now be open.
) else (
  echo IS-2 Blender build failed. Check the errors above.
)
echo.
pause
exit /b %CODE%

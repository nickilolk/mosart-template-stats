@echo off
title Mosart Template Stats

:: Create a shortcut with custom icon on first run
set SHORTCUT=%~dp0Viz Mosart Template Stats.lnk
if not exist "%SHORTCUT%" (
    powershell -NoProfile -Command ^
      "$s = (New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT%');" ^
      "$s.TargetPath = '%~f0';" ^
      "$s.IconLocation = '%~dp0public\shortcut.ico';" ^
      "$s.WorkingDirectory = '%~dp0';" ^
      "$s.Save()"
)

:: Read PORT from .env (fallback to 3002)
set PORT=3002
for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
    if "%%a"=="PORT" set PORT=%%b
)

:: Check node is available
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js was not found. Please install it from https://nodejs.org
    pause
    exit /b 1
)

:: Install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
)

:: Start the server in a new window
start "Viz Mosart Template Stats — Server" cmd /k "node server.js"

:: Wait for server to start, then open browser
timeout /t 2 /nobreak >nul
start http://localhost:%PORT%

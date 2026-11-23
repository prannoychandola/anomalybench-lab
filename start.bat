@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required. Install it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
if not exist "results\nab-v1.1-report.json" (
  echo Generating the NAB benchmark report...
  node scripts\run_benchmark.js
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
start "AnomalyBench Lab" http://127.0.0.1:8000
node server.js
pause

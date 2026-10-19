@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo [x] Electron not installed. Run: npm install
  exit /b 1
)
rem Clear Electron-as-Node so the GUI can start (some IDEs/agents export this).
set "ELECTRON_RUN_AS_NODE="
"node_modules\electron\dist\electron.exe" .

@echo off
setlocal
set "PAYPAL_SANDBOX_CLIENT_ID="
set "PAYPAL_SANDBOX_CLIENT_SECRET="
set "ORDERNEST_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%ORDERNEST_NODE%" set "ORDERNEST_NODE=node"
cd /d "%~dp0"
"%ORDERNEST_NODE%" build.mjs
if errorlevel 1 goto failed
"%ORDERNEST_NODE%" start-local.mjs --with-ai
if errorlevel 1 goto failed
endlocal
exit /b 0
:failed
pause
endlocal
exit /b 1

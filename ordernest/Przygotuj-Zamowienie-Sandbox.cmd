@echo off
setlocal
set "ORDERNEST_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%ORDERNEST_NODE%" set "ORDERNEST_NODE=node"
cd /d "%~dp0"
"%ORDERNEST_NODE%" przygotuj-sandbox.mjs
pause
endlocal

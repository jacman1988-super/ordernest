param([switch]$WithAI)
$ErrorActionPreference = 'Stop'
$taskRuntime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $taskRuntime)) {
  $taskNode = Get-Command node -ErrorAction SilentlyContinue
  if (-not $taskNode) { throw 'Node.js 22.19 or newer is required. You can open ../OrderNest-demo.html for the offline demonstration.' }
  $taskRuntime = $taskNode.Source
}
Push-Location -LiteralPath $PSScriptRoot
try {
  & $taskRuntime build.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
  if ($WithAI) { & $taskRuntime start-local.mjs --with-ai }
  else { & $taskRuntime start-local.mjs }
} finally { Pop-Location }

$ErrorActionPreference = 'Stop'
$cocoAssets = Join-Path (Split-Path -Parent $PSScriptRoot) 'private-assets/local-model'
$cocoPidFile = Join-Path $cocoAssets 'server.pid'
if (-not (Test-Path -LiteralPath $cocoPidFile)) { Write-Output 'No Coco-owned model PID file.'; return }
$cocoServerId = [int](Get-Content -LiteralPath $cocoPidFile -Raw).Trim()
$cocoServer = Get-Process -Id $cocoServerId -ErrorAction SilentlyContinue
$cocoExpected = [IO.Path]::GetFullPath((Join-Path $cocoAssets 'runtime/llama-server.exe'))
if ($cocoServer -and $cocoServer.Path -ne $cocoExpected) { throw 'PID no longer belongs to the Coco model runtime; refusing to stop it.' }
if ($cocoServer) { Stop-Process -Id $cocoServerId; Write-Output "Stopped Coco model process $cocoServerId." }
Remove-Item -LiteralPath $cocoPidFile

param([switch]$Fast)
$ErrorActionPreference = 'Stop'
$cocoRoot = Split-Path -Parent $PSScriptRoot
$cocoAssets = Join-Path $cocoRoot 'private-assets/local-model'
$cocoExecutable = Join-Path $cocoAssets 'runtime/llama-server.exe'
$cocoModel = Join-Path $cocoAssets $(if ($Fast) { 'Qwen3-0.6B-Q8_0.gguf' } else { 'coco-qwen3-1.7b-q4_k_m.gguf' })
if (-not (Test-Path -LiteralPath $cocoExecutable) -or -not (Test-Path -LiteralPath $cocoModel)) {
    throw 'Run scripts/Setup-LocalModel.ps1 first.'
}
try {
    $cocoRunning = Invoke-RestMethod 'http://127.0.0.1:8081/v1/models' -TimeoutSec 2
    if (@($cocoRunning.data.id) -contains 'coco-local') {
        Write-Output 'Coco local model is already running at http://127.0.0.1:8081.'
        return
    }
} catch { }
$cocoArguments = @('--model', ('"' + $cocoModel + '"'), '--alias', 'coco-local', '--host', '127.0.0.1', '--port', '8081', '--ctx-size', '4096', '--threads', '4', '--threads-batch', '4', '--parallel', '1', '--cache-ram', '64', '--reasoning-budget', '0', '--no-webui', '--log-disable')
$cocoProcess = Start-Process -FilePath $cocoExecutable -ArgumentList $cocoArguments -WorkingDirectory $cocoAssets -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $cocoAssets 'server.stdout.log') -RedirectStandardError (Join-Path $cocoAssets 'server.stderr.log')
Set-Content -LiteralPath (Join-Path $cocoAssets 'server.pid') -Value $cocoProcess.Id
Write-Output "Started Coco local model process $($cocoProcess.Id). It may take a moment to load."
Write-Output 'Health: http://127.0.0.1:8081/health. Keep this service running alongside the backend/frontend.'
$cocoPython = Join-Path $cocoRoot 'backend/.venv/Scripts/python.exe'
if (Test-Path -LiteralPath $cocoPython) {
    Write-Output 'Warming the local AI before the first customer message...'
    for ($cocoAttempt = 0; $cocoAttempt -lt 15; $cocoAttempt++) {
        try {
            $cocoHealth = Invoke-RestMethod 'http://127.0.0.1:8081/health' -TimeoutSec 1
            if ($cocoHealth.status -eq 'ok') { break }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    & $cocoPython (Join-Path $PSScriptRoot 'warm_local_model.py')
}

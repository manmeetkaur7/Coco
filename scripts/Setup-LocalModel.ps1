param([switch]$IncludeFast)
$ErrorActionPreference = 'Stop'
$cocoRoot = Split-Path -Parent $PSScriptRoot
$cocoAssets = Join-Path $cocoRoot 'private-assets/local-model'
New-Item -ItemType Directory -Path $cocoAssets -Force | Out-Null
$cocoZip = Join-Path $cocoAssets 'llama-cpu.zip'
$cocoSource = Join-Path $cocoAssets 'Qwen3-1.7B-Q8_0.gguf'
$cocoModel = Join-Path $cocoAssets 'coco-qwen3-1.7b-q4_k_m.gguf'
$cocoRuntime = Join-Path $cocoAssets 'runtime'
function Get-CocoVerifiedFile($Uri, $Path, $Sha256) {
    if (-not (Test-Path -LiteralPath $Path)) {
        & curl.exe --fail --location --retry 2 --output $Path $Uri
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $Uri" }
    }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $Sha256) {
        throw "Checksum mismatch: $Path. Remove that incomplete file and run setup again."
    }
}
Get-CocoVerifiedFile 'https://github.com/ggml-org/llama.cpp/releases/download/b12080/llama-b12080-bin-win-cpu-x64.zip' $cocoZip 'C0A89DD2EDCE978FF0A7A5DF88E97A735FFAB08162E18329C5E964ECE6ED160C'
if (-not (Test-Path -LiteralPath (Join-Path $cocoRuntime 'llama-server.exe'))) {
    Expand-Archive -LiteralPath $cocoZip -DestinationPath $cocoRuntime
}
if ($IncludeFast) {
  Get-CocoVerifiedFile 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/23749fefcc72300e3a2ad315e1317431b06b590a/Qwen3-0.6B-Q8_0.gguf' (Join-Path $cocoAssets 'Qwen3-0.6B-Q8_0.gguf') '9465E63A22ADD5354D9BB4B99E90117043C7124007664907259BD16D043BB031'
}
  Get-CocoVerifiedFile 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/90862c4b9d2787eaed51d12237eafdfe7c5f6077/Qwen3-1.7B-Q8_0.gguf' $cocoSource '061B54DAADE076B5D3362DAC252678D17DA8C68F07560BE70818CACE6590CB1A'
  if (-not (Test-Path -LiteralPath $cocoModel)) {
    & (Join-Path $cocoRuntime 'llama-quantize.exe') --allow-requantize $cocoSource $cocoModel Q4_K_M 4
    if ($LASTEXITCODE -ne 0) { throw 'Model quantization failed. Do not start the partial model.' }
  }
Invoke-WebRequest 'https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/raw/90862c4b9d2787eaed51d12237eafdfe7c5f6077/LICENSE' -OutFile (Join-Path $cocoAssets 'Qwen-LICENSE.txt')
Invoke-WebRequest 'https://raw.githubusercontent.com/ggml-org/llama.cpp/b12080/LICENSE' -OutFile (Join-Path $cocoAssets 'llama-LICENSE.txt')
Write-Output 'Local runtime and quantized model are ready inside Coco private-assets. No system-wide installation was performed.'
Write-Output 'Default model: Qwen3-1.7B Q4_K_M. Use -IncludeFast to prepare the experimental smaller model.'

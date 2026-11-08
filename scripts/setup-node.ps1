param([string]$Version = 'v24.22.2')
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^v\d+\.\d+\.\d+$') { throw 'Use a full Node version such as v24.22.2.' }
$root = Split-Path $PSScriptRoot -Parent
$nodeDir = Join-Path $root '.tools\node'
$cacheDir = Join-Path $root '.cache'
New-Item -ItemType Directory -Path $nodeDir,$cacheDir -Force | Out-Null
$binary = Join-Path $nodeDir 'node.exe'
if ((Test-Path -LiteralPath $binary) -and (& $binary --version) -eq $Version) {
    Write-Output "Project Node $Version is already available."
    return
}
$download = Join-Path $cacheDir "node-$Version.exe"
$checksums = Join-Path $cacheDir "node-$Version-SHASUMS256.txt"
Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$Version/win-x64/node.exe" -OutFile $download
Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$Version/SHASUMS256.txt" -OutFile $checksums
$expected = ((Get-Content -LiteralPath $checksums | Where-Object { $_ -match ' win-x64/node.exe$' }) -split '\s+')[0]
if (!$expected -or (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne $expected) { throw 'Node SHA-256 verification failed.' }
Copy-Item -LiteralPath $download -Destination $binary
& $binary --version

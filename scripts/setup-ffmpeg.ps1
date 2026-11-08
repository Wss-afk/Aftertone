$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$tools = Join-Path $root '.tools\ffmpeg'
$installed = Get-ChildItem -LiteralPath $tools -Directory -ErrorAction SilentlyContinue |
    Where-Object { (Test-Path -LiteralPath (Join-Path $_.FullName 'bin\ffmpeg.exe')) -and (Test-Path -LiteralPath (Join-Path $_.FullName 'bin\ffprobe.exe')) } |
    Select-Object -First 1
if ($installed) { Write-Output "Project FFmpeg is ready: $($installed.FullName)"; return }
$cache = Join-Path $root '.cache\ffmpeg'
New-Item -ItemType Directory -Path $tools,$cache -Force | Out-Null
$archive = Join-Path $cache 'ffmpeg-release-essentials.zip'
$checksum = Join-Path $cache 'ffmpeg-release-essentials.zip.sha256'
Invoke-WebRequest -UseBasicParsing -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile $archive
Invoke-WebRequest -UseBasicParsing -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256' -OutFile $checksum
$expected = ((Get-Content -LiteralPath $checksum -Raw).Trim() -split '\s+')[0]
if (!$expected -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) { throw 'FFmpeg SHA-256 mismatch.' }
Expand-Archive -LiteralPath $archive -DestinationPath $tools
Write-Output 'Project FFmpeg and FFprobe are ready.'

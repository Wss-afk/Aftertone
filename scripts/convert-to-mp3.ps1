param(
    [Parameter(Mandatory)] [string]$InputPath,
    [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$source = (Resolve-Path -LiteralPath $InputPath).ProviderPath
if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw 'Input must be a file.' }
if (!$OutputPath) {
    $OutputPath = Join-Path $root ('data\converted\' + [IO.Path]::GetFileNameWithoutExtension($source) + '.mp3')
}
$destination = [IO.Path]::GetFullPath($OutputPath)
if ($destination.Equals($source, [StringComparison]::OrdinalIgnoreCase)) { throw 'Output must differ from the original file.' }
if (Test-Path -LiteralPath $destination) { throw 'Output already exists. No file was overwritten.' }
$command = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
if ($command) { $encoder = $command.Source }
else {
    $tools = Join-Path $root '.tools\ffmpeg'
    $build = Get-ChildItem -LiteralPath $tools -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\ffmpeg.exe') } |
        Sort-Object Name -Descending | Select-Object -First 1
    if (!$build) { throw 'FFmpeg is required. Install FFmpeg or put a Windows build under .tools\ffmpeg. See README.md.' }
    $encoder = Join-Path $build.FullName 'bin\ffmpeg.exe'
}
New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
& $encoder -hide_banner -nostdin -n -loglevel error -i $source -map 0:a:0 -vn -c:a libmp3lame -q:a 2 -id3v2_version 3 $destination
if ($LASTEXITCODE) { throw 'Conversion failed. The original file was not changed.' }
Write-Output $destination

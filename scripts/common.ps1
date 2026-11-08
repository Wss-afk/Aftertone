$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$NodeRuntime = Join-Path $ProjectRoot '.tools\node\node.exe'
if (Test-Path -LiteralPath $NodeRuntime) {
    $env:PATH = (Split-Path $NodeRuntime) + ';' + $env:PATH
} else {
    $NodeRuntime = (Get-Command node -ErrorAction Stop).Source
}
$NpmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($NpmCommand) {
    $NpmCli = Join-Path (Split-Path $NpmCommand.Source) 'node_modules\npm\bin\npm-cli.js'
}

function Import-DatabaseSettings {
    $settingsPath = Join-Path $ProjectRoot '.local\database.json'
    if (Test-Path -LiteralPath $settingsPath) {
        $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
        if (!$env:SPRING_DATASOURCE_URL) { $env:SPRING_DATASOURCE_URL = $settings.url }
        if (!$env:SPRING_DATASOURCE_USERNAME) { $env:SPRING_DATASOURCE_USERNAME = $settings.username }
        if (!$env:SPRING_DATASOURCE_PASSWORD) { $env:SPRING_DATASOURCE_PASSWORD = $settings.password }
    }
    if (!$env:APP_MUSIC_DIR) { $env:APP_MUSIC_DIR = Join-Path $ProjectRoot 'data\music' }
}

function Set-AudioToolPaths {
    $build = Get-ChildItem -LiteralPath (Join-Path $ProjectRoot '.tools\ffmpeg') -Directory -ErrorAction SilentlyContinue |
        Where-Object { (Test-Path -LiteralPath (Join-Path $_.FullName 'bin\ffmpeg.exe')) -and (Test-Path -LiteralPath (Join-Path $_.FullName 'bin\ffprobe.exe')) } |
        Sort-Object Name -Descending | Select-Object -First 1
    if (!$env:APP_FFMPEG_PATH -and $build) { $env:APP_FFMPEG_PATH = Join-Path $build.FullName 'bin\ffmpeg.exe' }
    if (!$env:APP_FFPROBE_PATH -and $build) { $env:APP_FFPROBE_PATH = Join-Path $build.FullName 'bin\ffprobe.exe' }
}

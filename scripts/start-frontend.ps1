param([switch]$Lan)
. "$PSScriptRoot\common.ps1"
Push-Location (Join-Path $ProjectRoot 'frontend')
try {
    if (!(Test-Path -LiteralPath 'node_modules')) { & $NodeRuntime $NpmCli install; if ($LASTEXITCODE) { throw 'npm install failed' } }
    if ($Lan) { & $NodeRuntime $NpmCli run dev -- --host 0.0.0.0 }
    else { & $NodeRuntime $NpmCli run dev }
    if ($LASTEXITCODE) { throw "Frontend exited with code $LASTEXITCODE" }
} finally { Pop-Location }

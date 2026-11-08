. "$PSScriptRoot\common.ps1"
Import-DatabaseSettings
Set-AudioToolPaths
if (!$env:SPRING_DATASOURCE_PASSWORD) { throw 'Set SPRING_DATASOURCE_PASSWORD or initialize the project database first. See README.md.' }
Push-Location (Join-Path $ProjectRoot 'backend')
try { & '.\mvnw.cmd' spring-boot:run; if ($LASTEXITCODE) { throw "Backend exited with code $LASTEXITCODE" } }
finally { Pop-Location }

param([string]$MySqlHome = 'C:\Program Files\MySQL\MySQL Server 8.4')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$config = Join-Path $root '.local\mysql\my.ini'
if (!(Test-Path -LiteralPath $config)) { throw 'Run scripts\init-local-db.ps1 first.' }
$mysql = Join-Path $MySqlHome 'bin\mysql.exe'
$admin = Import-Clixml -LiteralPath (Join-Path $root '.local\mysql\admin.xml')
$previousPassword = $env:MYSQL_PWD
try {
    $env:MYSQL_PWD = $admin.GetNetworkCredential().Password
    & $mysql --protocol=TCP --host=127.0.0.1 --port=13308 --user=root --connect-timeout=2 --execute='SELECT 1' 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Output 'Project MySQL already running: 127.0.0.1:13308'; return }
} finally { $env:MYSQL_PWD = $previousPassword }
$server = Join-Path $MySqlHome 'bin\mysqld.exe'
$process = Start-Process -FilePath $server -ArgumentList @("--defaults-file=`"$config`"") -WindowStyle Hidden -PassThru
Write-Output "Starting project MySQL on 127.0.0.1:13308 (PID $($process.Id))."
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
        $env:MYSQL_PWD = $admin.GetNetworkCredential().Password
        & $mysql --protocol=TCP --host=127.0.0.1 --port=13308 --user=root --connect-timeout=1 --execute='SELECT 1' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Output 'Project MySQL ready.'; return }
    } finally { $env:MYSQL_PWD = $previousPassword }
    Start-Sleep -Milliseconds 500
}
throw 'MySQL did not become ready. Inspect .local\mysql\mysql.log.'

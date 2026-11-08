param([string]$MySqlHome = 'C:\Program Files\MySQL\MySQL Server 8.4')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$admin = Import-Clixml -LiteralPath (Join-Path $root '.local\mysql\admin.xml')
$previousPassword = $env:MYSQL_PWD
try {
    $env:MYSQL_PWD = $admin.GetNetworkCredential().Password
    & (Join-Path $MySqlHome 'bin\mysqladmin.exe') --protocol=TCP --host=127.0.0.1 --port=13308 --user=root shutdown
    if ($LASTEXITCODE) { throw 'Project MySQL shutdown failed.' }
} finally { $env:MYSQL_PWD = $previousPassword }

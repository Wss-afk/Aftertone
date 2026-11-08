param([string]$MySqlHome = 'C:\Program Files\MySQL\MySQL Server 8.4')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$localDir = Join-Path $root '.local\mysql'
$dataDir = Join-Path $localDir 'data'
$settingsPath = Join-Path $root '.local\database.json'
if (Test-Path -LiteralPath $settingsPath) { throw 'Database settings already exist. No changes made.' }
if (Test-Path -LiteralPath $dataDir) { throw 'MySQL data directory already exists. No changes made.' }
$server = Join-Path $MySqlHome 'bin\mysqld.exe'
$mysql = Join-Path $MySqlHome 'bin\mysql.exe'
if (!(Test-Path -LiteralPath $server)) { throw "MySQL not found at $MySqlHome" }
$portProbe = [Net.Sockets.TcpClient]::new()
try { $portProbe.Connect('127.0.0.1', 13308); throw 'Port 13308 is already occupied.' }
catch [Net.Sockets.SocketException] { }
finally { $portProbe.Dispose() }
New-Item -ItemType Directory -Path $localDir -Force | Out-Null
& $server --no-defaults --initialize-insecure "--basedir=$MySqlHome" "--datadir=$dataDir" --console
if ($LASTEXITCODE) { throw 'MySQL initialization failed.' }
$config = Join-Path $localDir 'my.ini'
$unixData = $dataDir.Replace('\', '/')
$unixHome = $MySqlHome.Replace('\', '/')
$unixLocal = $localDir.Replace('\', '/')
@"
[mysqld]
basedir="$unixHome"
datadir="$unixData"
port=13308
bind-address=127.0.0.1
mysqlx=OFF
character-set-server=utf8mb4
collation-server=utf8mb4_0900_ai_ci
default-time-zone=+00:00
log-error="$unixLocal/mysql.log"
pid-file="$unixLocal/mysql.pid"
"@ | Set-Content -LiteralPath $config -Encoding ascii
$process = Start-Process -FilePath $server -ArgumentList @("--defaults-file=`"$config`"") -WindowStyle Hidden -PassThru
$ready = $false
$previousPassword = $env:MYSQL_PWD
try {
    $env:MYSQL_PWD = ''
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        & $mysql --protocol=TCP --host=127.0.0.1 --port=13308 --user=root --skip-password --connect-timeout=1 --execute='SELECT 1' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (!$ready) { throw "Project MySQL failed to start (PID $($process.Id)). Inspect $localDir\mysql.log" }
    $appPassword = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    $rootPassword = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    $sql = @"
CREATE DATABASE night_signal CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'night_signal_app'@'127.0.0.1' IDENTIFIED BY '$appPassword';
GRANT ALL PRIVILEGES ON night_signal.* TO 'night_signal_app'@'127.0.0.1';
ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootPassword';
"@
    $sql | & $mysql --protocol=TCP --host=127.0.0.1 --port=13308 --user=root --skip-password --default-character-set=utf8mb4
    if ($LASTEXITCODE) { throw 'Could not provision project database.' }
    [pscredential]::new('root', (ConvertTo-SecureString $rootPassword -AsPlainText -Force)) | Export-Clixml -LiteralPath (Join-Path $localDir 'admin.xml')
    @{ url = 'jdbc:mysql://127.0.0.1:13308/night_signal?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true'; username = 'night_signal_app'; password = $appPassword } | ConvertTo-Json | Set-Content -LiteralPath $settingsPath -Encoding utf8
    Write-Output 'Created isolated project MySQL on 127.0.0.1:13308. Existing MySQL84 service was not modified.'
} finally { $env:MYSQL_PWD = $previousPassword }

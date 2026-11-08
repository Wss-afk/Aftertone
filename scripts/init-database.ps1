param(
    [int]$Port = 3308,
    [string]$AdminUser = 'root',
    [securestring]$AdminPassword,
    [string]$MySqlHome = 'C:\Program Files\MySQL\MySQL Server 8.4'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (!$AdminPassword) { $AdminPassword = Read-Host "MySQL $AdminUser password (port $Port)" -AsSecureString }
$credential = [pscredential]::new($AdminUser, $AdminPassword)
$previousPassword = $env:MYSQL_PWD
try {
    $env:MYSQL_PWD = $credential.GetNetworkCredential().Password
    $appPassword = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    $mysql = Join-Path $MySqlHome 'bin\mysql.exe'
    $sql = @"
CREATE DATABASE night_signal CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'night_signal_app'@'127.0.0.1' IDENTIFIED BY '$appPassword';
GRANT ALL PRIVILEGES ON night_signal.* TO 'night_signal_app'@'127.0.0.1';
"@
    $sql | & $mysql --protocol=TCP --host=127.0.0.1 "--port=$Port" "--user=$AdminUser" --default-character-set=utf8mb4
    if ($LASTEXITCODE) { throw 'Provisioning failed. Existing databases and accounts were not overwritten. Inspect MySQL output.' }
    $localDir = Join-Path $root '.local'
    New-Item -ItemType Directory -Path $localDir -Force | Out-Null
    $settings = Join-Path $localDir 'database.json'
    if (Test-Path -LiteralPath $settings) {
        Copy-Item -LiteralPath $settings -Destination (Join-Path $localDir ("database-before-" + (Get-Date -Format 'yyyyMMdd-HHmmssfff') + '.json'))
    }
    @{ url = "jdbc:mysql://127.0.0.1:$Port/night_signal?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true"; username = 'night_signal_app'; password = $appPassword } | ConvertTo-Json | Set-Content -LiteralPath $settings -Encoding utf8
    Write-Output "Created night_signal and its dedicated application account at 127.0.0.1:$Port."
} finally { $env:MYSQL_PWD = $previousPassword }

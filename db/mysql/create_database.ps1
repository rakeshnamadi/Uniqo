<#
.SYNOPSIS
  Creates the Uniqo MySQL database: schema, routines, configuration, app user, admin login,
  and (optionally) all current website data.

.EXAMPLE
  .\create_database.ps1                                   # local MySQL, root user, empty showroom config
  .\create_database.ps1 -ImportData                       # also copy designs/orders/... from the website
  .\create_database.ps1 -Server db.example.com -Port 3306 -User admin -ImportData

  Needs the MySQL 8.0.19+ command-line client (mysql.exe) and Python 3.
#>
param(
  [string]$Server = "127.0.0.1",
  [int]$Port = 3306,
  [string]$User = "root",
  [string]$MysqlPath = "mysql",
  [string]$AppUser = "uniqo_app",
  [string]$AppHost = "%",
  [switch]$ImportData
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command $MysqlPath -ErrorAction SilentlyContinue)) {
  throw "mysql client not found. Install MySQL 8 (or add its bin folder to PATH) or pass -MysqlPath 'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe'."
}

function Read-Secret([string]$prompt) {
  $s = Read-Host -Prompt $prompt -AsSecureString
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}
function SqlQuote([string]$s) { "'" + $s.Replace("\", "\\").Replace("'", "\'") + "'" }
# Windows PowerShell 5.1 writes UTF-8 with a BOM, which the mysql client rejects - write files without one
function Write-NoBom([string]$path, [string]$text) { [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $false)) }

$rootPw = Read-Secret "MySQL password for '$User'@$Server"
$appPw  = Read-Secret "Choose a password for the app user '$AppUser' (blank = generate one)"
if (-not $appPw) { $appPw = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ }); $generated = $true }

# credentials go in a temporary option file, never on the command line
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("uniqo-" + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
$cnf = Join-Path $tmp "client.cnf"
@"
[client]
host=$Server
port=$Port
user=$User
password="$($rootPw.Replace('\','\\').Replace('"','\"'))"
default-character-set=utf8mb4
"@ | ForEach-Object { Write-NoBom $cnf $_ }

function Run-Sql([string]$file, [string]$label) {
  Write-Host "  -> $label" -ForegroundColor DarkYellow
  $path = (Resolve-Path $file).Path.Replace("\", "/")
  & $MysqlPath "--defaults-extra-file=$cnf" --show-warnings -e "source $path"
  if ($LASTEXITCODE -ne 0) { throw "MySQL failed while running $label" }
}

try {
  Write-Host "`nUNIQO  -  creating MySQL database on ${Server}:$Port" -ForegroundColor Yellow
  Run-Sql "$here\01_schema.sql"          "01 schema (tables, keys, constraints)"
  Run-Sql "$here\02_views_routines.sql"  "02 views, functions, stored procedures"
  & python "$here\uniqo_mysql.py" seed | Out-Null
  Run-Sql "$here\03_seed_config.sql"     "03 site configuration + Design Lobby catalogue"

  $userSql = Join-Path $tmp "04_app_user.sql"
  @"
CREATE USER IF NOT EXISTS '$AppUser'@'$AppHost' IDENTIFIED BY $(SqlQuote $appPw);
ALTER USER '$AppUser'@'$AppHost' IDENTIFIED BY $(SqlQuote $appPw);
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON uniqo.* TO '$AppUser'@'$AppHost';
FLUSH PRIVILEGES;
"@ | ForEach-Object { Write-NoBom $userSql $_ }
  Run-Sql $userSql "04 least-privilege app user '$AppUser'"

  if ($ImportData) {
    & python "$here\uniqo_mysql.py" export
    if ($LASTEXITCODE -ne 0) { throw "Export from the website database failed" }
    Run-Sql "$here\05_data.sql" "05 website data (designs, orders, feedback, looks, admin login)"
  } else {
    $adminSql = Join-Path $tmp "admin.sql"
    Write-Host "  -> admin login for the panel" -ForegroundColor DarkYellow
    Write-NoBom $adminSql ((& python "$here\uniqo_mysql.py" admin-sql --user admin) -join "`n")
    if ($LASTEXITCODE -ne 0) { throw "Could not create the admin login" }
    Run-Sql $adminSql "admin user"
  }

  Write-Host "`nVerification:" -ForegroundColor Yellow
  & $MysqlPath "--defaults-extra-file=$cnf" -t -e "USE uniqo; SELECT (SELECT COUNT(*) FROM designs) designs, (SELECT COUNT(*) FROM orders) orders, (SELECT COUNT(*) FROM lobby_fabrics) fabrics, (SELECT COUNT(*) FROM locations) cities, (SELECT COUNT(*) FROM admin_users) admins;"
  Write-Host "`nDone. Database 'uniqo' is ready." -ForegroundColor Green
  if ($generated) { Write-Host "App user password (store it safely, shown once): $appPw" -ForegroundColor Cyan }
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

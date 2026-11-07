# ==============================================================================
# DentaCare Dental Clinic: Automated PostgreSQL Backup for PowerShell
# ==============================================================================
param(
  [string]$BackupDir = "$PSScriptRoot\..\backups",
  [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

$DateTag = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "dentacare_$DateTag.dump"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   DENTACARE: PRODUCTION DATABASE BACKUP UTILITY (PowerShell)" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Timestamp    : $DateTag"
Write-Host "Target Dir   : $BackupDir"
Write-Host "Retention    : $RetentionDays days"

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$DbUrl = $env:DATABASE_URL
if ([string]::IsNullOrWhiteSpace($DbUrl)) {
  Write-Error "[FATAL] DATABASE_URL environment variable is not defined."
  exit 1
}

# Strip Prisma schema query parameter if present (e.g. ?schema=public) as native pg_dump rejects it
$CleanDbUrl = $DbUrl.Split('?')[0]

$PgDumpCmd = Get-Command "pg_dump" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $PgDumpCmd) {
  $PossiblePaths = @(Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  if ($PossiblePaths.Count -gt 0) {
    $PgDumpCmd = $PossiblePaths[0]
  }
}

if (-not $PgDumpCmd) {
  Write-Error "[FATAL] pg_dump executable not found in PATH or standard PostgreSQL directory."
  exit 1
}

$PgRestoreCmd = Get-Command "pg_restore" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $PgRestoreCmd) {
  $PossiblePaths = @(Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_restore.exe" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  if ($PossiblePaths.Count -gt 0) {
    $PgRestoreCmd = $PossiblePaths[0]
  }
}

Write-Host "Creating compressed binary dump with $PgDumpCmd..." -ForegroundColor Yellow
& $PgDumpCmd --format=custom --compress=9 --no-owner --no-privileges --dbname=$CleanDbUrl --file=$BackupFile

if (-not (Test-Path $BackupFile) -or (Get-Item $BackupFile).Length -eq 0) {
  Write-Error "[FATAL] Backup file is empty or was not created: $BackupFile"
  if (Test-Path $BackupFile) { Remove-Item $BackupFile -Force }
  exit 1
}

Write-Host "Verifying archive integrity with $PgRestoreCmd..." -ForegroundColor Yellow
& $PgRestoreCmd --list $BackupFile | Out-Null

$SizeMb = [math]::Round((Get-Item $BackupFile).Length / 1MB, 2)
Write-Host "[SUCCESS] Verified backup created: $BackupFile ($SizeMb MB)" -ForegroundColor Green

# Cleanup old dumps
$LimitDate = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupDir -Filter "dentacare_*.dump" | Where-Object { $_.LastWriteTime -lt $LimitDate } | ForEach-Object {
  Write-Host "Purging expired backup: $($_.Name)" -ForegroundColor DarkGray
  Remove-Item $_.FullName -Force
}

Write-Host "Backup routine finished successfully." -ForegroundColor Green

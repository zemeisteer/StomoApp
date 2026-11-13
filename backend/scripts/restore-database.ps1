# ==============================================================================
# DentaCare Dental Clinic: PostgreSQL Restore Utility for PowerShell
# ==============================================================================
param(
  [Parameter(Mandatory=$true)]
  [string]$BackupFile
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) {
  Write-Error "[FATAL] Backup file not found: $BackupFile"
  exit 1
}

$DbUrl = $env:DATABASE_URL
if ([string]::IsNullOrWhiteSpace($DbUrl)) {
  Write-Error "[FATAL] DATABASE_URL environment variable is not defined."
  exit 1
}

# Strip Prisma schema query parameter if present
$CleanDbUrl = $DbUrl.Split('?')[0]

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   DENTACARE: DATABASE RESTORE UTILITY (PowerShell)" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Target Backup: $BackupFile"
Write-Host "Target DB    : $CleanDbUrl"

$confirm = Read-Host "WARNING: This will restore database tables from archive. Proceed? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
  Write-Host "Operation cancelled by user." -ForegroundColor Yellow
  exit 0
}

$PgRestoreCmd = Get-Command "pg_restore" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $PgRestoreCmd) {
  $PossiblePaths = @(Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_restore.exe" -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
  if ($PossiblePaths.Count -gt 0) {
    $PgRestoreCmd = $PossiblePaths[0]
  }
}

if (-not $PgRestoreCmd) {
  Write-Error "[FATAL] pg_restore executable not found in PATH or standard PostgreSQL directory."
  exit 1
}

Write-Host "Restoring database with $PgRestoreCmd..." -ForegroundColor Yellow
& $PgRestoreCmd --clean --if-exists --no-owner --no-privileges -d $CleanDbUrl $BackupFile

Write-Host "[SUCCESS] Database restored cleanly from $BackupFile." -ForegroundColor Green

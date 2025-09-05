$ErrorActionPreference = "Stop"
param([string]$OutDir = "backups")
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$url = $env:DATABASE_URL
if (-not $url) { Write-Host "DATABASE_URL not set. Fallback to prisma\dev.db (sqlite)"; $url = "file:./prisma/dev.db" }
if ($url.ToLower().StartsWith("file:")) {
  $dbPath = $url.Substring(5)
  if (-not (Test-Path $dbPath)) { $dbPath = "prisma\dev.db" }
  $ts = Get-Date -Format "yyyyMMdd_HHmmss"
  $dest = Join-Path $OutDir "sqlite_$ts.db"
  Copy-Item $dbPath $dest -Force
  Write-Host "✅ SQLite backup -> $dest"
} elseif ($url -match "^(postgresql|postgres)://") {
  $ts = Get-Date -Format "yyyyMMdd_HHmmss"
  $dest = Join-Path $OutDir "postgres_$ts.sql"
  if (Get-Command pg_dump -ErrorAction SilentlyContinue) {
    & pg_dump $url > $dest
    Write-Host "✅ Postgres backup -> $dest"
  } else {
    Write-Error "pg_dump not found. Install PostgreSQL client or use Docker-based dump."
  }
} else {
  Write-Error "Unsupported DATABASE_URL: $url"
}
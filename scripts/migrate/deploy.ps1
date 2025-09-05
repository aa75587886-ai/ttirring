$ErrorActionPreference="Stop"
if (-not $env:DATABASE_URL) { Write-Warning "DATABASE_URL not set; .env 사용 가정" }
npx prisma migrate deploy
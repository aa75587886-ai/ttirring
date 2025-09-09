@echo off
REM Dockerized PostgreSQL backup
setlocal EnableDelayedExpansion

if "%CONTAINER%"=="" set CONTAINER=ttirring-postgres
if "%POSTGRES_USER%"=="" set POSTGRES_USER=ttirring
if "%POSTGRES_PASSWORD%"=="" set POSTGRES_PASSWORD=ttirringpw
if "%POSTGRES_DB%"=="" set POSTGRES_DB=ttirring

set "FILE=%~1"
if "%FILE%"=="" (
  for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
  set "FILE=backup_!TS!.dump"
)

echo [*] backing up DB "%POSTGRES_DB%" from container "%CONTAINER%" to "%FILE%" ...
docker exec %CONTAINER% sh -lc "mkdir -p /backup && PGPASSWORD=%POSTGRES_PASSWORD% pg_dump -U %POSTGRES_USER% -d %POSTGRES_DB% -F c -b -v -f /backup/backup.dump" || (echo [ERR] pg_dump failed & exit /b 1)
docker cp %CONTAINER%:/backup/backup.dump "%FILE%" || (echo [ERR] docker cp failed & exit /b 2)

echo [+] backup written: %FILE%
endlocal

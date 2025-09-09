@echo off
REM Dockerized PostgreSQL restore (.dump => pg_restore, .sql => psql)
setlocal EnableDelayedExpansion

if "%CONTAINER%"=="" set CONTAINER=ttirring-postgres
if "%POSTGRES_USER%"=="" set POSTGRES_USER=ttirring
if "%POSTGRES_PASSWORD%"=="" set POSTGRES_PASSWORD=ttirringpw
if "%POSTGRES_DB%"=="" set POSTGRES_DB=ttirring

set "SRC=%~1"
if "%SRC%"=="" (
  echo Usage: %~nx0 ^<backup.dump or dump.sql^>
  exit /b 1
)

echo [*] copying "%SRC%" into container "%CONTAINER%"...
docker cp "%SRC%" %CONTAINER%:/restore_tmp || (echo [ERR] docker cp failed & exit /b 2)

echo %SRC% | findstr /I /R "\.dump$" >nul
if %errorlevel%==0 (
  echo [*] pg_restore (.dump)
  docker exec -e PGPASSWORD=%POSTGRES_PASSWORD% %CONTAINER% sh -lc "pg_restore -U %POSTGRES_USER% -d %POSTGRES_DB% -c -v /restore_tmp" || (echo [ERR] restore failed & exit /b 3)
) else (
  echo [*] psql (.sql)
  docker exec -e PGPASSWORD=%POSTGRES_PASSWORD% %CONTAINER% sh -lc "psql -U %POSTGRES_USER% -d %POSTGRES_DB% -v ON_ERROR_STOP=1 -f /restore_tmp" || (echo [ERR] restore failed & exit /b 3)
)

echo [+] restore completed.
endlocal

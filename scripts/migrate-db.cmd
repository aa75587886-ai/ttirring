@echo off
REM Prisma migrate helper (deploy/reset/status/studio) for Postgres
setlocal EnableDelayedExpansion

if "%POSTGRES_USER%"=="" set POSTGRES_USER=ttirring
if "%POSTGRES_PASSWORD%"=="" set POSTGRES_PASSWORD=ttirringpw
if "%POSTGRES_DB%"=="" set POSTGRES_DB=ttirring
if "%POSTGRES_HOST%"=="" set POSTGRES_HOST=localhost
if "%POSTGRES_PORT%"=="" set POSTGRES_PORT=5432

set "DATABASE_URL=postgresql://%POSTGRES_USER%:%POSTGRES_PASSWORD%@%POSTGRES_HOST%:%POSTGRES_PORT%/%POSTGRES_DB%?schema=public"
set "PRISMA_CLIENT_ENGINE_TYPE=binary"

set MODE=%1
if "%MODE%"=="" set MODE=deploy

echo [*] DB URL: %DATABASE_URL%
if /I "%MODE%"=="deploy" goto do_deploy
if /I "%MODE%"=="reset"  goto do_reset
if /I "%MODE%"=="status" goto do_status
if /I "%MODE%"=="studio" goto do_studio

echo Usage: %~nx0 [deploy^|reset^|status^|studio]
exit /b 1

:do_deploy
  echo [*] prisma migrate deploy
  set DATABASE_URL=%DATABASE_URL%
  call npx prisma migrate deploy || exit /b 30
  call npx prisma generate
  echo [+] deploy done.
  goto :eof

:do_reset
  echo [!!] prisma migrate reset (DESTRUCTIVE)
  set DATABASE_URL=%DATABASE_URL%
  call npx prisma migrate reset --force --skip-generate || exit /b 31
  call npx prisma generate
  echo [+] reset done.
  goto :eof

:do_status
  set DATABASE_URL=%DATABASE_URL%
  call npx prisma migrate status
  goto :eof

:do_studio
  set DATABASE_URL=%DATABASE_URL%
  call npx prisma studio
  goto :eof

[![Release](https://img.shields.io/github/v/release/aa75587886-ai/ttirring?label=Ttirring%20API)](https://github.com/aa75587886-ai/ttirring/releases/latest)
[![CI](https://github.com/aa75587886-ai/ttirring/actions/workflows/ci.yml/badge.svg)](https://github.com/aa75587886-ai/ttirring/actions/workflows/ci.yml)

# Ttirring (띠링) Platform API

Express + Prisma + SQLite 기반 API.

## URLs
- Docs: http://localhost:3000/docs
- Health: GET /health

## Downloads
- OpenAPI spec (YAML):  
  https://github.com/aa75587886-ai/ttirring/releases/latest/download/ttirring_openapi_v0.1.yaml
- Postman collection:  
  https://github.com/aa75587886-ai/ttirring/releases/latest/download/ttirring.postman_collection.json

## Quick Start
1. npm install
2. npm run prisma:generate
3. npm run seed
4. npm run dev

## Scripts
- dev, dev:nodemon, prisma:generate, prisma:migrate, seed, studio, reset

## Endpoints (요약)
- Jobs: GET /v1/jobs, PATCH /v1/jobs/{job_id}
- Reservations: POST /v1/reservations, GET /v1/reservations
- Wallet: POST /v1/wallet/recharge, GET /v1/wallet/transactions?userId=...
- Settlements: POST /v1/settlements/preview, POST /v1/settlements/close

- OpenAPI (local): GET /openapi.yaml

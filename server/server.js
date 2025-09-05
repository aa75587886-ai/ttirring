// server/server.js — P0 최종: 존재 검증 훅 + 표준 에러 통일 + /docs + /openapi.json
const express = require('express');
const path = require('path');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');
const { randomUUID } = require('crypto');
const fs = require('fs');

const app = express();
app.use(express.json());

// ---------- Swagger (/docs + /openapi.json) ----------
const openapiPath = path.join(__dirname, '..', 'openapi', 'ttirring_openapi_v0.1.yaml');
let swaggerDoc;
try {
  swaggerDoc = YAML.load(openapiPath);
} catch {
  swaggerDoc = {
    openapi: '3.0.3',
    info: { title: 'Ttirring API (fallback)', version: '0.1.1' },
    paths: { '/health': { get: { responses: { '200': { description: 'OK' } } } } },
  };
}
// /openapi.json 노출
app.get('/openapi.json', (_req, res) => res.json(swaggerDoc));
// Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, { explorer: true }));

// ---------- In-memory 데이터 ----------
const channels = new Set(['CH-01', 'CH-02']);
const users = new Set(['DR-01', 'DR-99', 'U-01']);
const jobs = new Map(); // jobId -> { jobId, channelId, status }
const wallet = new Map();
const idem = new Map(); // idempotency-key -> txResponse

wallet.set('DR-01', 50000);
wallet.set('DR-99', 10000);
wallet.set('U-01', 0);

// ---------- 표준 오류 도우미 ----------
function err(res, status, code, message, details) {
  return res.status(status).json({ ok: false, code, message, details });
}
const badRequest = (res, msg, d) => err(res, 400, 'BAD_REQUEST', msg, d);
const notFound = (res, code, msg) => err(res, 404, code, msg);
const invalidAmt = (res) => err(res, 400, 'INVALID_AMOUNT', 'must be >= 1');
const invalidRsn = (res, allowed) => err(res, 400, 'INVALID_REASON', allowed);

// ---------- 존재 검증 훅 ----------
function requireChannelIdQuery(req, res, next) {
  const { channelId } = req.query;
  if (!channelId) return badRequest(res, 'channelId required');
  if (!channels.has(channelId)) return notFound(res, 'CHANNEL_NOT_FOUND', `channelId=${channelId}`);
  next();
}
function requireBodyFields(fields) {
  return (req, res, next) => {
    const body = req.body || {};
    const missing = fields.filter(
      (f) => body[f] === undefined || body[f] === null || body[f] === ''
    );
    if (missing.length) return badRequest(res, `Missing required fields: ${missing.join(', ')}`);
    next();
  };
}
function ensureUserChannelJob(req, res, next) {
  const { userId, channelId, jobId } = req.body || {};
  if (userId && !users.has(userId)) return notFound(res, 'USER_NOT_FOUND', `userId=${userId}`);
  if (channelId && !channels.has(channelId))
    return notFound(res, 'CHANNEL_NOT_FOUND', `channelId=${channelId}`);
  if (jobId && !jobs.has(jobId)) return notFound(res, 'JOB_NOT_FOUND', `jobId=${jobId}`);
  next();
}

// ---------- Health ----------
app.get('/health', (_req, res) => res.json({ ok: true }));

// ---------- Reservations ----------
app.post(
  '/v1/reservations',
  requireBodyFields(['jobId', 'channelId', 'passengerName', 'pickupAddr', 'dropoffAddr']),
  (req, res) => {
    const { jobId, channelId } = req.body;
    if (!channels.has(channelId)) return notFound(res, 'CHANNEL_NOT_FOUND', `channelId=${channelId}`);
    jobs.set(jobId, { jobId, channelId, status: 'PENDING' });
    return res
      .status(201)
      .json({ ok: true, reservation: { jobId, channelId, status: 'PENDING' } });
  }
);

// ---------- Jobs ----------
app.get('/v1/jobs', requireChannelIdQuery, (req, res) => {
  const { channelId } = req.query;
  const list = Array.from(jobs.values()).filter((j) => j.channelId === channelId);
  return res.json({ ok: true, jobs: list });
});
app.get('/v1/jobs/stats', requireChannelIdQuery, (req, res) => {
  const { channelId } = req.query;
  const byStatus = { PENDING: 0, DISPATCHED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELED: 0 };
  let total = 0;
  for (const j of jobs.values()) {
    if (j.channelId === channelId) {
      byStatus[j.status] = (byStatus[j.status] || 0) + 1;
      total++;
    }
  }
  return res.json({ ok: true, channelId, total, byStatus });
});

// ---------- Wallet ----------
const DEBIT_REASONS = new Set(['CANCEL_PENALTY', 'FEE', 'ADJUST']);
const CREDIT_REASONS = new Set(['RECHARGE', 'REFUND', 'ADJUST']);

app.post(
  '/v1/wallet_tx/debit',
  requireBodyFields(['userId', 'amount', 'reason', 'channelId']),
  ensureUserChannelJob,
  (req, res) => {
    const idKey = req.get('Idempotency-Key');
    const { userId, amount, reason, jobId, channelId } = req.body;

    if (!Number.isInteger(amount) || amount < 1) return invalidAmt(res);
    if (!DEBIT_REASONS.has(reason)) return invalidRsn(res, 'CANCEL_PENALTY|FEE|ADJUST');

    if (idKey && idem.has(idKey)) {
      const prev = idem.get(idKey);
      res.set('Idempotency-Handled', 'true');
      res.set('Idempotency-Replay', 'true');
      return res.status(200).json(prev);
    }

    const txId = randomUUID();
    const prevBal = wallet.get(userId) ?? 0;
    const balanceAfter = prevBal - amount;
    wallet.set(userId, balanceAfter);

    const payload = {
      ok: true,
      txId,
      userId,
      amount,
      reason,
      jobId,
      channelId,
      balanceAfter,
      idempotency: idKey
        ? {
            idempotent: true,
            idempotencyKey: idKey,
            firstRequestAt: new Date().toISOString(),
            duplicateOf: txId,
          }
        : undefined,
    };
    if (idKey) {
      idem.set(idKey, payload);
      res.set('Idempotency-Handled', 'true');
    }
    return res.status(201).json(payload);
  }
);

app.post(
  '/v1/wallet_tx/credit',
  requireBodyFields(['userId', 'amount', 'reason', 'channelId']),
  (req, res, next) => {
    const { userId, channelId } = req.body || {};
    if (userId && !users.has(userId)) return notFound(res, 'USER_NOT_FOUND', `userId=${userId}`);
    if (channelId && !channels.has(channelId))
      return notFound(res, 'CHANNEL_NOT_FOUND', `channelId=${channelId}`);
    next();
  },
  (req, res) => {
    const idKey = req.get('Idempotency-Key');
    const { userId, amount, reason, jobId, channelId } = req.body;

    if (!Number.isInteger(amount) || amount < 1) return invalidAmt(res);
    if (!CREDIT_REASONS.has(reason)) return invalidRsn(res, 'RECHARGE|REFUND|ADJUST');

    if (idKey && idem.has(idKey)) {
      const prev = idem.get(idKey);
      res.set('Idempotency-Handled', 'true');
      res.set('Idempotency-Replay', 'true');
      return res.status(200).json(prev);
    }

    const txId = randomUUID();
    const prevBal = wallet.get(userId) ?? 0;
    const balanceAfter = prevBal + amount;
    wallet.set(userId, balanceAfter);

    const payload = {
      ok: true,
      txId,
      userId,
      amount,
      reason,
      jobId,
      channelId,
      balanceAfter,
      idempotency: idKey
        ? {
            idempotent: true,
            idempotencyKey: idKey,
            firstRequestAt: new Date().toISOString(),
            duplicateOf: txId,
          }
        : undefined,
    };
    if (idKey) {
      idem.set(idKey, payload);
      res.set('Idempotency-Handled', 'true');
    }
    return res.status(201).json(payload);
  }
);

// ---------- Reports ----------
app.get('/v1/reports/top-drivers', (req, res) => {
  const { channelId, limit = '10' } = req.query;
  if (!channelId) return badRequest(res, 'channelId required');
  if (!channels.has(channelId)) return notFound(res, 'CHANNEL_NOT_FOUND', `channelId=${channelId}`);

  const cap = Math.max(1, Math.min(parseInt(limit, 10) || 10, 100));
  const sample = [
    { driverId: 'DR-01', jobs: 4, amount: 63000, driverPayout: 50400, platformFee: 12600 },
    { driverId: 'DR-99', jobs: 1, amount: 15000, driverPayout: 12000, platformFee: 3000 },
  ];
  return res.json({ ok: true, drivers: sample.slice(0, cap) });
});

// ---------- Settlements ----------
app.get('/v1/settlements/daily', (req, res) => {
  const { channelId, from, to } = req.query;
  if (!channelId) return badRequest(res, 'channelId required');
  if (!channels.has(channelId)) return notFound(res, 'CHANNEL_NOT_FOUND', `channelId=${channelId}`);

  const series = [
    { day: '2025-09-01', jobs: 3, amount: 53000, driverPayout: 42400, platformFee: 10600 },
    { day: '2025-09-02', jobs: 2, amount: 25000, driverPayout: 20000, platformFee: 5000 },
    { day: '2025-09-03', jobs: 1, amount: 12000, driverPayout: 9600, platformFee: 2400 },
  ];
  return res.json({ ok: true, range: { from: from || '', to: to || '' }, channelId, series });
});

// ---------- Boot ----------
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Reservation/Wallet API running at http://localhost:${PORT}  (Docs: /docs)`);
  });
}
module.exports = app;

// mount channel summary (adjustFilter=manual)
const channelSummary = require('./routes/channelSummary');
app.use('/v1', channelSummary);


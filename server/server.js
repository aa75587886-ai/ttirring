// server/server.js
"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const { z } = require("zod");

// Swagger (/docs)
let swaggerUi, YAML, swaggerDoc;
try {
  swaggerUi = require("swagger-ui-express");
  YAML = require("yamljs");
  const specPath = path.join(__dirname, "..", "openapi", "ttirring_openapi_v0.1.yaml");
  if (fs.existsSync(specPath)) swaggerDoc = YAML.load(specPath);
} catch (_) {
  /* optional */
}

// App
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Security headers (helmet)
const helmet = require("helmet");
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: { defaultSrc: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
// CORS open (simple for local dev)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// Rate limit
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "RATE_LIMITED" },
});
app.use(limiter);

// ✅ 공통 응답 헤더 (가볍게 하드코딩)
app.use((req, res, next) => {
  res.setHeader("X-App-Version", "v0.2.1");
  res.setHeader("X-Env", process.env.NODE_ENV || "development");
  next();
});

// Logging (pino + pretty in non-prod)
const pino = require("pino");
const baseLogger =
  process.env.NODE_ENV === "production"
    ? pino()
    : pino({
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            singleLine: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l o",
          },
        },
      });

const pinoHttp = require("pino-http")({
  logger: baseLogger,
  genReqId: (req) =>
    req.headers["x-request-id"] ||
    `req-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  customProps: (req) => ({
    reqId: req.id,
    route: req.route?.path || req.path,
    method: req.method,
    channelId: req.query?.channelId || req.body?.channelId,
  }),
});
app.use(pinoHttp);
app.use((req, res, next) => {
  if (req.id) res.setHeader("X-Request-Id", req.id);
  next();
});

// In-memory stores (reset on restart)
const reservationsByReq = new Map();
const reservationsById = new Map();
const walletTxById = new Map();

// Sample data
const users = new Set(["DR-01"]);
const channels = new Set(["CH-02", "CH-01"]);
const allowedDebitReasons = new Set(["FEE", "CANCEL_PENALTY", "ADJUSTMENT"]);
const allowedCreditReasons = new Set(["PAYOUT", "ADJUSTMENT"]);
const jobs = [
  { jobId: "J0901", channelId: "CH-02", userId: "DR-01", amount: 5000, status: "COMPLETED" },
];

// Utils
const sendJson = (res, code, obj) => res.status(code).json(obj);
const err = (res, code, http = 400) => sendJson(res, http, { ok: false, error: code });
const newId = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// === 존재 검증 미들웨어 (in-memory) ===
const validateUser = (req, res, next) => {
  const userId = req.body?.userId || req.query?.userId;
  if (!userId) return err(res, "userId required", 400);
  if (!users.has(userId)) return err(res, "USER_NOT_FOUND", 404);
  next();
};

const validateChannel = (req, res, next) => {
  const channelId = req.body?.channelId || req.query?.channelId;
  if (!channelId) return err(res, "channelId required", 400);
  if (!channels.has(channelId)) return err(res, "CHANNEL_NOT_FOUND", 404);
  next();
};

const validateJob = (req, res, next) => {
  const jobId = req.body?.jobId || req.query?.jobId;
  if (!jobId) return err(res, "jobId required", 400);
  const found = jobs.find((j) => j.jobId === jobId);
  if (!found) return err(res, "JOB_NOT_FOUND", 404);
  next();
};

// Zod Schemas
const LatLngSchema = z.object({ lat: z.number(), lng: z.number() });
const ReservationCreateSchema = z.object({
  userId: z.string().min(1),
  channelId: z.string().min(1),
  pickup: LatLngSchema,
  dropoff: LatLngSchema,
  scheduledAt: z.string().min(1),
  reqId: z.string().min(1),
});
const WalletTxSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive(),
  reason: z.string().min(1),
  jobId: z.string().min(1),
  channelId: z.string().min(1),
  txId: z.string().min(1),
});
const ReqIdQuerySchema = z.object({ reqId: z.string().min(1) });
const ChannelIdQuerySchema = z.object({ channelId: z.string().min(1) });
const ChannelSummaryQuerySchema = z.object({
  channelId: z.string().min(1),
  adjustFilter: z.enum(["manual", "none"]).optional(),
});

// Health
app.get("/health", (req, res) => sendJson(res, 200, { ok: true, message: "ttirring API running" }));

// Reservations: create (idempotent by reqId)
app.post("/v1/reservations", (req, res) => {
  // ✅ 채널 유효성 404를 Zod 이전에 우선 처리
  const ch = req.body?.channelId;
  if (!ch) return err(res, "MISSING_FIELDS", 400);
  if (!channels.has(ch)) return err(res, "CHANNEL_NOT_FOUND", 404);

  const parsed = ReservationCreateSchema.safeParse(req.body);
  if (!parsed.success) return err(res, "MISSING_FIELDS", 400); // 테스트 메시지 호환
  const { userId, channelId, pickup, dropoff, scheduledAt, reqId } = parsed.data;

  if (reservationsByReq.has(reqId)) {
    const reservation = reservationsByReq.get(reqId);
    return sendJson(res, 200, { ok: true, reservation, idempotent: true });
  }

  const reservation = {
    reservationId: newId("R"),
    userId,
    channelId,
    pickup,
    dropoff,
    scheduledAt,
    createdAt: new Date().toISOString(),
  };
  reservationsByReq.set(reqId, reservation);
  reservationsById.set(reservation.reservationId, reservation);
  return sendJson(res, 201, { ok: true, reservation });
});

// Reservations: get by reqId
app.get("/v1/reservations/by-req", (req, res) => {
  const parsed = ReqIdQuerySchema.safeParse(req.query);
  if (!parsed.success) return err(res, "BAD_REQUEST", 400);
  const { reqId } = parsed.data;
  if (!reservationsByReq.has(reqId)) return err(res, "RESERVATION_NOT_FOUND", 404);
  return sendJson(res, 200, { ok: true, reservation: reservationsByReq.get(reqId) });
});

// Wallet (미들웨어 + Zod + idempotent)
const validateWalletBody = (kind) => (req, res, next) => {
  const parsed = WalletTxSchema.safeParse(req.body);
  if (!parsed.success) return err(res, "BAD_REQUEST", 400);

  const { reason } = parsed.data;
  if (kind === "debit" && !allowedDebitReasons.has(reason)) return err(res, "INVALID_REASON", 400);
  if (kind === "credit" && !allowedCreditReasons.has(reason)) return err(res, "INVALID_REASON", 400);

  next();
};

const walletHandler = (kind) => (req, res) => {
  const body = req.body;

  // idempotent by txId
  if (walletTxById.has(body.txId)) {
    const tx = walletTxById.get(body.txId);
    return sendJson(res, 200, { ok: true, tx, idempotent: true });
  }

  const tx = {
    txId: body.txId,
    userId: body.userId,
    amount: body.amount,
    reason: body.reason,
    jobId: body.jobId,
    channelId: body.channelId,
    createdAt: new Date().toISOString(),
    type: kind.toUpperCase(),
  };
  walletTxById.set(body.txId, tx);
  return sendJson(res, 201, { ok: true, tx });
};

// 지갑 출금 (DEBIT)
app.post(
  "/v1/wallet_tx/debit",
  validateChannel,
  validateUser,
  validateJob,
  validateWalletBody("debit"),
  walletHandler("debit")
);

// 지갑 충전 (CREDIT)
app.post(
  "/v1/wallet_tx/credit",
  validateChannel,
  validateUser,
  validateJob,
  validateWalletBody("credit"),
  walletHandler("credit")
);

// Jobs stats
app.get("/v1/jobs/stats", (req, res) => {
  const parsed = ChannelIdQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    if (!req.query?.channelId) return err(res, "MISSING_CHANNEL", 400); // 테스트 호환
    return err(res, "BAD_REQUEST", 400);
  }
  const { channelId } = parsed.data;
  if (!channels.has(channelId)) return err(res, "CHANNEL_NOT_FOUND", 404);

  const list = jobs.filter((j) => j.channelId === channelId);
  const byStatus = {};
  for (const j of list) byStatus[j.status] = (byStatus[j.status] || 0) + 1;

  return sendJson(res, 200, { ok: true, channelId, total: list.length, byStatus });
});

// Channel summary
app.get("/v1/channel-summary", (req, res) => {
  const parsed = ChannelSummaryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    if (!req.query?.channelId) return err(res, "MISSING_CHANNEL", 400); // 테스트 호환
    return err(res, "BAD_REQUEST", 400);
  }
  const channelId = parsed.data.channelId;
  const adjustFilter = parsed.data.adjustFilter ?? "none";

  if (!channels.has(channelId)) return err(res, "CHANNEL_NOT_FOUND", 404);

  const list = jobs.filter((j) => j.channelId === channelId);
  const jobsCount = list.length;
  let amount = list.reduce((a, b) => a + (b.amount || 0), 0);

  let adjusted = false;
  if (adjustFilter === "manual") {
    adjusted = true;
    amount = Math.round(amount / 2); // manual = base의 1/2 (테스트 기대)
  }
  return sendJson(res, 200, {
    ok: true,
    channelId,
    summary: { jobs: jobsCount, amount, adjusted },
  });
});

// Swagger UI (/docs)
if (swaggerUi && swaggerDoc) {
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));
} else {
  app.get("/docs", (req, res) => res.type("text/plain").send("OpenAPI spec not loaded."));
}

// Fallback 404 & error handler
app.use((req, res) => err(res, "NOT_FOUND", 404));
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  req.log?.error({ err: error, reqId: req.id }, "Unhandled error");
  if (res.headersSent) return;
  const status = error.status || error.statusCode || 500;
  res.status(status).json({
    ok: false,
    error: status === 500 ? "INTERNAL_ERROR" : error.code || "ERROR",
    message: process.env.NODE_ENV === "production" ? undefined : error.message,
  });
});

// === Export for tests ===
module.exports = app;

// === Run server only when run directly ===
if (require.main === module) {
  const PORT = Number(process.env.PORT || 3000);
  const srv = app.listen(PORT, () => {
    console.log(`🚀 Ttirring API running at http://localhost:${PORT} (Docs: /docs)`);
  });
  const shutdown = (signal) => {
    console.log(`[${signal}] shutting down...`);
    srv.close(() => {
      console.log("HTTP server closed.");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  ["SIGINT", "SIGTERM"].forEach((sig) => process.on(sig, () => shutdown(sig)));
}

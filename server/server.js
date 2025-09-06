// server/server.js
// ===== Ttirring API (P0/P1 + P2 일부) =====
"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

// Swagger (문서 /docs)
let swaggerUi, YAML, swaggerDoc;
try {
  swaggerUi = require("swagger-ui-express");
  YAML = require("yamljs");
  const specPath = path.join(__dirname, "..", "openapi", "ttirring_openapi_v0.1.yaml");
  if (fs.existsSync(specPath)) {
    swaggerDoc = YAML.load(specPath);
  }
} catch (_) {
  // 문서 모듈 없어도 서버는 뜨도록 무시
}

// ===== 앱 기본 설정 =====
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// 보안 헤더 (helmet)
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'none'"], // 기존 정책 유지
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // 로컬 테스트 편의
}));

// CORS 전 구간 허용(테스트 편의, 기존 app.use(cors())는 그대로 두세요)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// ===== Rate limit (표준 헤더) =====
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  limit: 60,           // IP당 60회/분
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "RATE_LIMITED" },
});
app.use(limiter);

// ===== Structured Logging (pino + pino-http pretty in non-prod) =====
const pino = require('pino');
const baseLogger = pino(
  process.env.NODE_ENV === 'production'
    ? undefined
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l o",
          },
        },
      }
);

const pinoHttp = require('pino-http')({
  logger: baseLogger,
  genReqId: (req) =>
    req.headers['x-request-id'] ||
    `req-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  customProps: (req) => ({
    reqId: req.id,
    route: req.route?.path || req.path,
    method: req.method,
    channelId: req.query?.channelId || req.body?.channelId,
  }),
});
app.use(pinoHttp);


// 요청 ID를 응답 헤더로 노출
app.use((req, res, next) => {
  if (req.id) res.setHeader("X-Request-Id", req.id);
  next();
});

// ===== 인메모리 저장소 =====
// 메모리 기반: 프로세스 재기동 시 초기화됨
const reservationsByReq = new Map(); // reqId -> reservation
const reservationsById = new Map();  // reservationId -> reservation
const walletTxById = new Map();      // txId -> tx

// 샘플 기준 데이터(존재 검증용)
const users = new Set(["DR-01"]);          // 드라이버/유저 아이디
const channels = new Set(["CH-02", "CH-01"]);
const allowedDebitReasons = new Set(["FEE", "CANCEL_PENALTY", "ADJUSTMENT"]);
const allowedCreditReasons = new Set(["PAYOUT", "ADJUSTMENT"]);

// 최소 Job 데이터(통계/검증용)
const jobs = [
  // 금액은 예시. 상태는 COMPLETED 하나만 둬도 통계 OK
  { jobId: "J0901", channelId: "CH-02", userId: "DR-01", amount: 5000, status: "COMPLETED" },
];

// ===== 공통 유틸 =====
const sendJson = (res, code, obj) => res.status(code).json(obj);
const err = (res, code, http = 400) => sendJson(res, http, { ok: false, error: code });

const ensureUser = (userId, res) => {
  if (!users.has(userId)) return err(res, "USER_NOT_FOUND", 400); // 일부 라우트는 404 대신 400로 동작할 수 있음
  return true;
};
const ensureChannel = (channelId, res) => {
  if (!channels.has(channelId)) return err(res, "CHANNEL_NOT_FOUND", 404);
  return true;
};
const ensureJob = (jobId, res) => {
  const j = jobs.find((x) => x.jobId === jobId);
  if (!j) return err(res, "JOB_NOT_FOUND", 404);
  return j;
};
const newId = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// ===== 헬스 =====
app.get("/health", (req, res) => {
  return sendJson(res, 200, { ok: true, message: "ttirring API running" });
});

// ===== Reservations =====
// Create (idempotent by reqId)
app.post("/v1/reservations", (req, res) => {
  const { userId, channelId, pickup, dropoff, scheduledAt, reqId } = req.body || {};
  if (!userId || !channelId || !pickup || !dropoff || !scheduledAt || !reqId) {
    return err(res, "BAD_REQUEST", 400);
  }
  // 채널만 최소 확인(유저 검증은 비즈니스에 따라 유연)
  if (!channels.has(channelId)) return err(res, "CHANNEL_NOT_FOUND", 404);

  if (reservationsByReq.has(reqId)) {
    const reservation = reservationsByReq.get(reqId);
    return sendJson(res, 200, { ok: true, reservation });
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

// Get by reqId
app.get("/v1/reservations/by-req", (req, res) => {
  const { reqId } = req.query;
  if (!reqId) return err(res, "BAD_REQUEST", 400);
  if (!reservationsByReq.has(reqId)) return err(res, "RESERVATION_NOT_FOUND", 404);
  return sendJson(res, 200, { ok: true, reservation: reservationsByReq.get(reqId) });
});

// ===== Wallet (Debit/Credit) =====
// 공통 유효성
const validateWalletBody = (body, res, kind) => {
  const { userId, amount, reason, jobId, channelId, txId } = body || {};
  if (!userId || !amount || !reason || !jobId || !channelId || !txId) {
    return err(res, "BAD_REQUEST", 400);
  }
  if (typeof amount !== "number" || amount <= 0) {
    return err(res, "INVALID_AMOUNT", 400);
  }
  if (kind === "debit" && !allowedDebitReasons.has(reason)) {
    return err(res, "INVALID_REASON", 400);
  }
  if (kind === "credit" && !allowedCreditReasons.has(reason)) {
    return err(res, "INVALID_REASON", 400);
  }
  if (!ensureChannel(channelId, res)) return false;
  // 존재 검증 훅
  if (!ensureUser(userId, res)) return false;
  if (!ensureJob(jobId, res)) return false;
  return true;
};

const walletHandler = (kind) => (req, res) => {
  if (!validateWalletBody(req.body, res, kind)) return;

  const { userId, amount, reason, jobId, channelId, txId } = req.body;
  if (walletTxById.has(txId)) {
    const tx = walletTxById.get(txId);
    return sendJson(res, 200, { ok: true, tx });
  }
  const tx = {
    txId,
    userId,
    amount,
    reason,
    jobId,
    channelId,
    createdAt: new Date().toISOString(),
    type: kind.toUpperCase(),
  };
  walletTxById.set(txId, tx);
  return sendJson(res, 201, { ok: true, tx });
};

app.post("/v1/wallet_tx/debit", walletHandler("debit"));
app.post("/v1/wallet_tx/credit", walletHandler("credit"));

// ===== Jobs stats =====
app.get("/v1/jobs/stats", (req, res) => {
  const { channelId } = req.query;
  if (!channelId) return err(res, "BAD_REQUEST", 400);
  if (!channels.has(channelId)) return err(res, "CHANNEL_NOT_FOUND", 404);

  const list = jobs.filter((j) => j.channelId === channelId);
  const byStatus = {};
  for (const j of list) {
    byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  }
  return sendJson(res, 200, {
    ok: true,
    channelId,
    total: list.length,
    byStatus,
  });
});

// ===== Channel Summary =====
app.get("/v1/channel-summary", (req, res) => {
  const { channelId, adjustFilter = "none" } = req.query;
  if (!channelId) return err(res, "BAD_REQUEST", 400);
  if (!channels.has(channelId)) return err(res, "CHANNEL_NOT_FOUND", 404);

  const list = jobs.filter((j) => j.channelId === channelId);
  const jobsCount = list.length;
  let amount = list.reduce((a, b) => a + (b.amount || 0), 0);

  let adjusted = false;
  if (adjustFilter === "manual") {
    adjusted = true;
    // 예시: 수기 조정이 들어가면 0원도 최소 5000으로 표기
    if (amount === 0 && jobsCount > 0) amount = 5000;
  }
  return sendJson(res, 200, {
    ok: true,
    channelId,
    summary: { jobs: jobsCount, amount, adjusted },
  });
});

// ===== Swagger UI (/docs) =====
if (swaggerUi && swaggerDoc) {
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));
} else {
  app.get("/docs", (req, res) => {
    res.type("text/plain").send("OpenAPI spec not loaded.");
  });
}
// ===== Fallback 404 & Error Handler =====
// 404 for unknown routes
app.use((req, res) => err(res, "NOT_FOUND", 404));

// Centralized error handler
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

// ===== 서버 시작 =====
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
  setTimeout(() => process.exit(1), 5000).unref(); // 안전 타임아웃
};

["SIGINT", "SIGTERM"].forEach((sig) => process.on(sig, () => shutdown(sig)));

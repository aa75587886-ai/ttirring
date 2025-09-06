// server/server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const yaml = require("yamljs");
const swaggerUi = require("swagger-ui-express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// ------------------------------
// 메모리 DB (데모/테스트용)
// ------------------------------
const walletTx = new Map(); // txId -> tx 저장 (idempotent)
const jobs = new Map();
const users = new Map();
const channels = new Set(["CH-01", "CH-02"]);

// 샘플 유저/잡 데이터
users.set("DR-01", { userId: "DR-01", balance: 10000 });
jobs.set("J0901", { jobId: "J0901", channelId: "CH-02", status: "COMPLETED" });

// ------------------------------
// Swagger 문서 로딩 (항상 최신 + 태그 자동 보정)
// ------------------------------
const swaggerPath = path.join(__dirname, "../openapi/ttirring_openapi_v0.1.yaml");

// /docs.json: YAML을 매번 읽어서 반환
app.get("/docs.json", (req, res) => {
  try {
    if (!fs.existsSync(swaggerPath)) {
      return res.status(404).json({ ok: false, error: "SWAGGER_FILE_NOT_FOUND" });
    }
    const doc = yaml.load(swaggerPath);

    // 루트 tags 기본값 보강
    if (!doc.tags) {
      doc.tags = [
        { name: "System" },
        { name: "Reports" },
        { name: "Wallet" },
        { name: "Jobs" },
        { name: "Reservations" },
      ];
    }

    // 개별 오퍼레이션에 태그 없으면 기본 태그 주입
    const p = doc.paths || {};
    const ensure = (pathKey, method, tag) => {
      const op = p[pathKey] && p[pathKey][method];
      if (!op) return;
      op.tags = Array.isArray(op.tags) && op.tags.length ? op.tags : [tag];
    };

    ensure("/health", "get", "System");
    ensure("/v1/channel-summary", "get", "Reports");
    ensure("/v1/wallet_tx/debit", "post", "Wallet");
    ensure("/v1/wallet_tx/credit", "post", "Wallet");
    ensure("/v1/jobs/stats", "get", "Jobs");
    ensure("/v1/reservations", "post", "Reservations");
    ensure("/v1/reservations/by-req", "get", "Reservations"); // ← 추가

    res.json(doc);
  } catch (e) {
    res.status(500).json({ ok: false, error: "SWAGGER_LOAD_FAIL", detail: String(e) });
  }
});

// Swagger UI는 /docs.json을 fetch해서 렌더
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(null, {
    swaggerUrl: "/docs.json",
    tagsSorter: "alpha",
    operationsSorter: "alpha",
  })
);

// ------------------------------
// Health check
// ------------------------------
app.get("/health", (req, res) => {
  res.json({ ok: true, message: "ttirring API running" });
});

// ------------------------------
// Wallet Debit API (idempotent)
// ------------------------------
app.post("/v1/wallet_tx/debit", (req, res) => {
  const { userId, amount, reason, jobId, channelId, txId } = req.body || {};

  if (!userId || !amount || !reason || !jobId || !channelId || !txId) {
    return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
  }
  if (!users.has(userId)) {
    return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
  }
  if (!jobs.has(jobId)) {
    return res.status(404).json({ ok: false, error: "JOB_NOT_FOUND" });
  }
  if (!channels.has(channelId)) {
    return res.status(404).json({ ok: false, error: "CHANNEL_NOT_FOUND" });
  }

  if (walletTx.has(txId)) {
    return res.status(200).json({ ok: true, tx: walletTx.get(txId), idempotent: true });
  }

  const user = users.get(userId);
  if (user.balance < amount) {
    return res.status(400).json({ ok: false, error: "INSUFFICIENT_FUNDS" });
  }

  user.balance -= amount;
  const tx = { txId, userId, amount, reason, jobId, channelId, type: "DEBIT" };
  walletTx.set(txId, tx);

  return res.status(201).json({ ok: true, tx });
});

// ------------------------------
// Wallet Credit API (idempotent)
// ------------------------------
app.post("/v1/wallet_tx/credit", (req, res) => {
  const { userId, amount, reason, jobId, channelId, txId } = req.body || {};

  if (!userId || !amount || !reason || !jobId || !channelId || !txId) {
    return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
  }
  if (!users.has(userId)) {
    return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
  }
  if (!jobs.has(jobId)) {
    return res.status(404).json({ ok: false, error: "JOB_NOT_FOUND" });
  }
  if (!channels.has(channelId)) {
    return res.status(404).json({ ok: false, error: "CHANNEL_NOT_FOUND" });
  }

  if (walletTx.has(txId)) {
    return res.status(200).json({ ok: true, tx: walletTx.get(txId), idempotent: true });
  }

  const user = users.get(userId);
  user.balance += amount;
  const tx = { txId, userId, amount, reason, jobId, channelId, type: "CREDIT" };
  walletTx.set(txId, tx);

  return res.status(201).json({ ok: true, tx });
});

// ------------------------------
// Jobs Stats API
// ------------------------------
app.get("/v1/jobs/stats", (req, res) => {
  const { channelId } = req.query;

  if (!channelId) {
    return res.status(400).json({ ok: false, error: "MISSING_CHANNEL" });
  }
  if (!channels.has(channelId)) {
    return res.status(404).json({ ok: false, error: "CHANNEL_NOT_FOUND" });
  }

  let total = 0;
  const byStatus = {};
  for (const job of jobs.values()) {
    if (job.channelId === channelId) {
      total++;
      byStatus[job.status] = (byStatus[job.status] || 0) + 1;
    }
  }

  return res.json({ ok: true, channelId, total, byStatus });
});

// ------------------------------
// Channel Summary API (adjustFilter=manual 시 금액 절반 적용)
// ------------------------------
app.get("/v1/channel-summary", (req, res) => {
  const { channelId, adjustFilter } = req.query;

  if (!channelId) {
    return res.status(400).json({ ok: false, error: "MISSING_CHANNEL" });
  }
  if (!channels.has(channelId)) {
    return res.status(404).json({ ok: false, error: "CHANNEL_NOT_FOUND" });
  }

  let totalJobs = 0;
  let totalAmount = 0;

  for (const job of jobs.values()) {
    if (job.channelId === channelId) {
      totalJobs++;
      if (job.status === "COMPLETED") {
        totalAmount += 10000; // 데모 금액
      }
    }
  }

  if (adjustFilter === "manual") {
    totalAmount = Math.floor(totalAmount / 2);
  }

  return res.json({
    ok: true,
    channelId,
    summary: {
      jobs: totalJobs,
      amount: totalAmount,
      adjusted: adjustFilter === "manual",
    },
  });
});

// ------------------------------
// Reservations API (idempotent by reqId)
// ------------------------------
const reservationsByReq = new Map();
const genId = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

app.post("/v1/reservations", (req, res) => {
  const { userId, pickup, dropoff, scheduledAt, channelId, reqId } = req.body || {};

  // 필수값 검증
  if (!userId || !pickup || !dropoff || !scheduledAt || !channelId) {
    return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
  }
  if (!users.has(userId)) {
    return res.status(404).json({ ok: false, error: "USER_NOT_FOUND" });
  }
  if (!channels.has(channelId)) {
    return res.status(404).json({ ok: false, error: "CHANNEL_NOT_FOUND" });
  }

  // idem 처리: 같은 reqId 재요청이면 200
  if (reqId && reservationsByReq.has(reqId)) {
    return res
      .status(200)
      .json({ ok: true, reservation: reservationsByReq.get(reqId), idempotent: true });
  }

  const reservation = {
    reservationId: genId("R"),
    userId,
    channelId,
    pickup,     // 예: { lat, lng }
    dropoff,    // 예: { lat, lng }
    scheduledAt // ISO string
  };

  if (reqId) reservationsByReq.set(reqId, reservation);
  return res.status(201).json({ ok: true, reservation });
});

// 예약 조회: reqId로 조회
app.get("/v1/reservations/by-req", (req, res) => {
  const { reqId } = req.query || {};
  if (!reqId) return res.status(400).json({ ok: false, error: "MISSING_REQID" });
  if (!reservationsByReq.has(reqId)) {
    return res.status(404).json({ ok: false, error: "RESERVATION_NOT_FOUND" });
  }
  return res.json({ ok: true, reservation: reservationsByReq.get(reqId) });
});

// ------------------------------
// 서버 시작 (테스트 환경 분리)
// ------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Ttirring API running at http://localhost:${PORT} (Docs: /docs)`);
  });
}

module.exports = app;

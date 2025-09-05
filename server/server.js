// server/server.js (ESM, 통교체 버전 - 아이템포턴시 적용)
import express from "express";
import cors from "cors";
import YAML from "yamljs";
import swaggerUi from "swagger-ui-express";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// __dirname 대체 (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Swagger 문서 연결 (http://localhost:3000/docs)
try {
  const openapiPath = path.join(__dirname, "..", "api", "ttirring_openapi_v0.1.yaml");
  const openapi = YAML.load(openapiPath);
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));
} catch (e) {
  console.warn("[SWAGGER] openapi yaml 로드 실패(무시 가능):", e?.message || e);
}

// ------------------------------
// 헬스체크 & 루트 리다이렉트
// ------------------------------
app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
app.get("/", (_req, res) => res.redirect("/docs"));

// ------------------------------
// 공통 유틸
// ------------------------------
const ALLOWED_DEBIT_REASONS  = ["CANCEL_PENALTY","WITHDRAWAL","FEE","ADJUSTMENT_MINUS","MANUAL_MINUS","REFUND_MINUS"];
const ALLOWED_CREDIT_REASONS = ["DEPOSIT","ADJUSTMENT_PLUS","MANUAL_PLUS","REFUND_PLUS"];

function badRequest(res, message, extra = {}) {
  return res.status(400).json({ ok: false, code: "BAD_REQUEST", message, ...extra });
}
function notFound(res, code, message) {
  return res.status(404).json({ ok: false, code, message });
}
function internal(res) {
  return res.status(500).json({ ok: false, code: "INTERNAL_ERROR", message: "unexpected error" });
}

// ------------------------------
// WALLET TX: DEBIT (아이템포턴시)
// ------------------------------
app.post("/v1/wallet_tx/debit", async (req, res) => {
  try {
    const { userId, amount, reason, jobId, channelId } = req.body || {};
    if (!userId || !amount || !reason || !jobId) {
      return badRequest(res, "userId, amount, reason, jobId required");
    }
    if (!ALLOWED_DEBIT_REASONS.includes(reason)) {
      return res.status(400).json({
        ok: false, code: "INVALID_REASON",
        message: `reason must be one of: ${ALLOWED_DEBIT_REASONS.join(", ")}`,
        allowed: ALLOWED_DEBIT_REASONS
      });
    }

    // 존재 검증
    const user = await prisma.user.findUnique({ where: { userId } }).catch(() => null);
    if (!user) return notFound(res, "USER_NOT_FOUND", "user not found");

    const job = await prisma.job.findUnique({ where: { jobId } }).catch(() => null);
    if (!job) return notFound(res, "JOB_NOT_FOUND", "job not found");

    if (channelId) {
      const ch = await prisma.channel.findUnique({ where: { channelId } }).catch(() => null);
      if (!ch) return notFound(res, "CHANNEL_NOT_FOUND", "channel not found");
    }

    // 아이템포턴시: 같은 jobId+type=DEBIT 있으면 기존 tx 반환
    const existing = await prisma.walletTx.findFirst({
      where: { jobId, type: "DEBIT" },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return res.status(200).json({
        ok: true,
        idempotent: true,
        message: "DEBIT already exists for this jobId",
        tx: existing,
      });
    }

    // 잔액 계산(마지막 거래 기준)
    const lastTx = await prisma.walletTx.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    const prevBalance = lastTx?.balance ?? 0;
    const newBalance = prevBalance - Number(amount);

    // 생성 (유니크 충돌도 idempotent로 되돌려주기)
    try {
      const tx = await prisma.walletTx.create({
        data: {
          type: "DEBIT",
          userId,
          amount: Number(amount),
          reason,
          jobId,
          channelId: channelId ?? null,
          balance: newBalance,
        },
      });
      return res.status(200).json({ ok: true, idempotent: false, message: "DEBIT recorded", tx });
    } catch (e) {
      if (e?.code === "P2002") {
        const dup = await prisma.walletTx.findFirst({
          where: { jobId, type: "DEBIT" },
          orderBy: { createdAt: "desc" },
        });
        if (dup) {
          return res.status(200).json({
            ok: true,
            idempotent: true,
            message: "DEBIT already exists for this jobId",
            tx: dup,
          });
        }
      }
      throw e;
    }
  } catch (err) {
    console.error("[DEBIT]", err);
    return internal(res);
  }
});

// ------------------------------
// WALLET TX: CREDIT (아이템포턴시)
// ------------------------------
app.post("/v1/wallet_tx/credit", async (req, res) => {
  try {
    const { userId, amount, reason, jobId, channelId } = req.body || {};
    if (!userId || !amount || !reason || !jobId) {
      return badRequest(res, "userId, amount, reason, jobId required");
    }
    if (!ALLOWED_CREDIT_REASONS.includes(reason)) {
      return res.status(400).json({
        ok: false, code: "INVALID_REASON",
        message: `reason must be one of: ${ALLOWED_CREDIT_REASONS.join(", ")}`,
        allowed: ALLOWED_CREDIT_REASONS
      });
    }

    // 존재 검증
    const user = await prisma.user.findUnique({ where: { userId } }).catch(() => null);
    if (!user) return notFound(res, "USER_NOT_FOUND", "user not found");

    const job = await prisma.job.findUnique({ where: { jobId } }).catch(() => null);
    if (!job) return notFound(res, "JOB_NOT_FOUND", "job not found");

    if (channelId) {
      const ch = await prisma.channel.findUnique({ where: { channelId } }).catch(() => null);
      if (!ch) return notFound(res, "CHANNEL_NOT_FOUND", "channel not found");
    }

    // 아이템포턴시: 같은 jobId+type=CREDIT 있으면 기존 tx 반환
    const existing = await prisma.walletTx.findFirst({
      where: { jobId, type: "CREDIT" },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return res.status(200).json({
        ok: true,
        idempotent: true,
        message: "CREDIT already exists for this jobId",
        tx: existing,
      });
    }

    // 잔액 계산
    const lastTx = await prisma.walletTx.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    const prevBalance = lastTx?.balance ?? 0;
    const newBalance = prevBalance + Number(amount);

    // 생성 (유니크 충돌도 idempotent로)
    try {
      const tx = await prisma.walletTx.create({
        data: {
          type: "CREDIT",
          userId,
          amount: Number(amount),
          reason,
          jobId,
          channelId: channelId ?? null,
          balance: newBalance,
        },
      });
      return res.status(200).json({ ok: true, idempotent: false, message: "CREDIT recorded", tx });
    } catch (e) {
      if (e?.code === "P2002") {
        const dup = await prisma.walletTx.findFirst({
          where: { jobId, type: "CREDIT" },
          orderBy: { createdAt: "desc" },
        });
        if (dup) {
          return res.status(200).json({
            ok: true,
            idempotent: true,
            message: "CREDIT already exists for this jobId",
            tx: dup,
          });
        }
      }
      throw e;
    }
  } catch (err) {
    console.error("[CREDIT]", err);
    return internal(res);
  }
});

// ------------------------------
// 서버 기동
// ------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Reservation/Wallet API running at http://localhost:${PORT}  (Docs: /docs)`);
});

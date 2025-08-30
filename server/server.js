// server/server.js — DB 기반 Jobs 영구 저장 (OpenAPI 0.4.0, idempotent 생성 지원, 확장 PATCH/DELETE, 404 JSON)
// ESM ("type": "module")
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";

let prisma = null;
try {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  console.log("[BOOT] Prisma initialized");
} catch (e) {
  console.warn("[BOOT] Prisma not available, using in-memory store:", e?.message || e);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb", type: "application/json" }));

const ALLOWED_STATUS = ["PENDING", "ASSIGNED", "PICKED_UP", "DROPPED_OFF", "CANCELED"];

// In-memory fallback
const mem = { reservations: new Map(), jobs: new Map() };

// utils
function clampPageSize(page = 1, size = 10) {
  const p = Math.max(1, parseInt(page || 1, 10));
  const s = Math.min(100, Math.max(1, parseInt(size || 10, 10)));
  return { p, s };
}
function paginateArray(array, page = 1, size = 10) {
  const { p, s } = clampPageSize(page, size);
  const start = (p - 1) * s;
  const items = array.slice(start, start + s);
  return { page: p, size: s, total: array.length, pages: Math.max(1, Math.ceil(array.length / s)), items };
}

// ----- OpenAPI (served at /openapi.json)
const openapi = {
  openapi: "3.0.3",
  info: { title: "Ttirring API", version: "0.4.0" },
  servers: [{ url: "http://127.0.0.1:3000", description: "Local server" }],
  components: {
    schemas: {
      ApiError: { type: "object", properties: { ok: { type: "boolean" }, message: { type: "string" } } },
      PageMeta: {
        type: "object",
        properties: { ok: { type: "boolean" }, page: { type: "integer" }, size: { type: "integer" }, total: { type: "integer" }, pages: { type: "integer" } }
      },
      Status: { type: "string", enum: ALLOWED_STATUS },
      Reservation: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          jobId: { type: "string", example: "J300" },
          channelId: { type: "string", example: "CH-01" },
          passengerName: { type: "string", nullable: true, example: "홍길동" },
          pickupAddr: { type: "string", nullable: true, example: "서울역" },
          dropoffAddr: { type: "string", nullable: true, example: "성남시" },
          status: { $ref: "#/components/schemas/Status" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      Job: {
        type: "object",
        properties: {
          jobId: { type: "string", example: "J300" },
          status: { $ref: "#/components/schemas/Status" },
          pickupAddr: { type: "string", nullable: true, example: "서울역" },
          dropoffAddr: { type: "string", nullable: true, example: "성남시" },
          assignedDriverId: { type: "string", nullable: true, example: "DRV-1001" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      }
    },
    responses: {
      BadRequest: { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
      NotFound:   { description: "Not found",   content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
      Conflict:   { description: "Conflict",    content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } }
    }
  },
  paths: {
    "/health": { get: { summary: "Health", tags: ["Health"], responses: { "200": { description: "OK" } } } },

    "/v1/reservations": {
      get: {
        summary: "List reservations", tags: ["Reservations"],
        parameters: [
          { in: "query", name: "status", schema: { $ref: "#/components/schemas/Status" } },
          { in: "query", name: "page",   schema: { type: "integer", minimum: 1, default: 1 } },
          { in: "query", name: "size",   schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } }
        ],
        responses: { "200": { description: "OK" } }
      },
      post: {
        summary: "Create reservation",
        tags: ["Reservations"],
        parameters: [
          { in: "query", name: "idempotent", schema: { type: "boolean" }, description: "If true, return existing record instead of 409 when jobId already exists." }
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object", required: ["jobId", "channelId"],
            properties: { jobId: { type: "string" }, channelId: { type: "string" }, passengerName: { type: "string" }, pickupAddr: { type: "string" }, dropoffAddr: { type: "string" } }
          } } }
        },
        responses: { "201": { description: "Created" }, "409": { $ref: "#/components/responses/Conflict" }, "400": { $ref: "#/components/responses/BadRequest" } }
      }
    },

    "/v1/reservations/{jobId}": {
      get:   {
        summary: "Get reservation", tags: ["Reservations"],
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { $ref: "#/components/responses/NotFound" } }
      },
      patch: {
        summary: "Update reservation (status/name/addresses)",
        tags: ["Reservations"],
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            properties: {
              status:        { $ref: "#/components/schemas/Status" },
              passengerName: { type: "string" },
              pickupAddr:    { type: "string" },
              dropoffAddr:   { type: "string" }
            },
            description: "Provide at least one field."
          } } }
        },
        responses: { "200": { description: "OK" }, "400": { $ref: "#/components/responses/BadRequest" }, "404": { $ref: "#/components/responses/NotFound" } }
      },
      delete: {
        summary: "Delete reservation",
        tags: ["Reservations"],
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { $ref: "#/components/responses/NotFound" } }
      }
    },

    "/v1/jobs": {
      get: {
        summary: "List jobs", tags: ["Jobs"],
        parameters: [
          { in: "query", name: "status", schema: { $ref: "#/components/schemas/Status" } },
          { in: "query", name: "page",   schema: { type: "integer", minimum: 1, default: 1 } },
          { in: "query", name: "size",   schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } }
        ],
        responses: { "200": { description: "OK" } }
      }
    },

    "/v1/jobs/{jobId}": {
      get:   {
        summary: "Get job", tags: ["Jobs"],
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { $ref: "#/components/responses/NotFound" } }
      },
      patch: {
        summary: "Update job (status/assignedDriverId)",
        tags: ["Jobs"],
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { status: { $ref: "#/components/schemas/Status" }, assignedDriverId: { type: "string" } } } } }
        },
        responses: { "200": { description: "OK" }, "400": { $ref: "#/components/responses/BadRequest" }, "404": { $ref: "#/components/responses/NotFound" } }
      },
      delete: {
        summary: "Delete job",
        tags: ["Jobs"],
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "404": { $ref: "#/components/responses/NotFound" } }
      }
    }
  }
};

// ----- Spec & Docs
app.get("/openapi.json", (_req, res) => res.json(openapi));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(undefined, {
  swaggerOptions: { url: "/openapi.json", displayRequestDuration: true },
  customSiteTitle: "Ttirring API"
}));

// ----- Root & Health
app.get("/", (_req, res) => res.redirect("/docs"));
app.get("/health", (_req, res) => res.json({ ok: true }));

// =================== Reservations ===================
app.get("/v1/reservations", async (req, res) => {
  try {
    const { status, page = 1, size = 10 } = req.query;
    if (status && !ALLOWED_STATUS.includes(status)) return res.status(400).json({ ok: false, message: `status must be one of: ${ALLOWED_STATUS.join(", ")}` });

    if (prisma?.reservation) {
      const where = status ? { status } : {};
      const [total, rows] = await Promise.all([
        prisma.reservation.count({ where }),
        prisma.reservation.findMany({ where, orderBy: { createdAt: "desc" } })
      ]);
      const { p, s } = clampPageSize(page, size);
      const start = (p - 1) * s;
      const items = rows.slice(start, start + s);
      const pages = Math.max(1, Math.ceil(total / s));
      return res.json({ ok: true, page: p, size: s, total, pages, items });
    }

    let items = Array.from(mem.reservations.values());
    if (status) items = items.filter(r => r.status === status);
    items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const paged = paginateArray(items, page, size);
    return res.json({ ok: true, ...paged });
  } catch {
    res.status(500).json({ ok: false, message: "failed to list reservations" });
  }
});

app.post("/v1/reservations", async (req, res) => {
  try {
    // ?idempotent=true 또는 ?idempotent=1 이면 중복 생성 시 200으로 기존 레코드 반환
    const isIdem = String(req.query.idempotent).toLowerCase() === "true" || req.query.idempotent === "1";

    const { jobId, channelId, passengerName, pickupAddr, dropoffAddr } = req.body ?? {};
    if (!jobId || !channelId) return res.status(400).json({ ok: false, message: "jobId and channelId are required" });

    if (prisma?.reservation) {
      try {
        // 1) Reservation upsert (idempotent 모드 고려)
        const existing = await prisma.reservation.findUnique({ where: { jobId } });
        if (existing) {
          if (isIdem) {
            // 2) Job도 최신화(없으면 생성)
            await prisma.job.upsert({
              where: { jobId },
              update: {
                pickupAddr: pickupAddr ?? existing.pickupAddr ?? undefined,
                dropoffAddr: dropoffAddr ?? existing.dropoffAddr ?? undefined
              },
              create: {
                jobId,
                status: existing.status,
                pickupAddr: existing.pickupAddr ?? pickupAddr ?? null,
                dropoffAddr: existing.dropoffAddr ?? dropoffAddr ?? null,
                assignedDriverId: null
              }
            });
            return res.json({ ok: true, created: false, reservation: existing });
          }
          return res.status(409).json({ ok: false, message: "jobId already exists" });
        }

        const reservation = await prisma.reservation.create({
          data: { jobId, channelId, passengerName, pickupAddr, dropoffAddr, status: "PENDING" }
        });

        // 3) Job을 DB에 영구 저장 (없으면 생성)
        await prisma.job.upsert({
          where: { jobId },
          update: {},
          create: {
            jobId,
            status: "PENDING",
            pickupAddr: pickupAddr ?? null,
            dropoffAddr: dropoffAddr ?? null,
            assignedDriverId: null
          }
        });

        return res.status(201).json({ ok: true, reservation });
      } catch (e) {
        if (e.code === "P2002") {
          if (isIdem) {
            const existing = await prisma.reservation.findUnique({ where: { jobId } });
            if (existing) return res.json({ ok: true, created: false, reservation: existing });
          }
          return res.status(409).json({ ok: false, message: "jobId already exists" });
        }
        throw e;
      }
    }

    // ---- In-memory fallback
    if (mem.reservations.has(jobId)) {
      const existing = mem.reservations.get(jobId);
      if (isIdem) return res.json({ ok: true, created: false, reservation: existing });
      return res.status(409).json({ ok: false, message: "jobId already exists" });
    }
    const now = new Date().toISOString();
    const reservation = {
      id: mem.reservations.size + 1, jobId, channelId, passengerName, pickupAddr, dropoffAddr,
      status: "PENDING", createdAt: now, updatedAt: now
    };
    mem.reservations.set(jobId, reservation);
    if (!mem.jobs.has(jobId)) mem.jobs.set(jobId, { jobId, status: "PENDING", pickupAddr, dropoffAddr, assignedDriverId: null, createdAt: now, updatedAt: now });
    return res.status(201).json({ ok: true, reservation });
  } catch {
    res.status(500).json({ ok: false, message: "failed to create reservation" });
  }
});

app.get("/v1/reservations/:jobId", async (req, res) => {
  try {
    const jobId = req.params.jobId;
    if (prisma?.reservation) {
      const reservation = await prisma.reservation.findUnique({ where: { jobId } });
      if (!reservation) return res.status(404).json({ ok: false, message: "not found" });
      return res.json({ ok: true, reservation });
    }
    const reservation = mem.reservations.get(jobId);
    if (!reservation) return res.status(404).json({ ok: false, message: "not found" });
    return res.json({ ok: true, reservation });
  } catch {
    res.status(500).json({ ok: false, message: "failed to get reservation" });
  }
});

// === Reservation PATCH 확장: status/name/addresses 모두 허용
app.patch("/v1/reservations/:jobId", async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const { status, passengerName, pickupAddr, dropoffAddr } = req.body ?? {};

    if (typeof status !== "undefined" && !ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ ok: false, message: `status must be one of: ${ALLOWED_STATUS.join(", ")}` });
    }
    if (
      typeof status === "undefined" &&
      typeof passengerName === "undefined" &&
      typeof pickupAddr === "undefined" &&
      typeof dropoffAddr === "undefined"
    ) {
      return res.status(400).json({ ok: false, message: "provide at least one field to update" });
    }

    const data = {};
    if (typeof status !== "undefined") data.status = status;
    if (typeof passengerName !== "undefined") data.passengerName = passengerName;
    if (typeof pickupAddr !== "undefined") data.pickupAddr = pickupAddr;
    if (typeof dropoffAddr !== "undefined") data.dropoffAddr = dropoffAddr;

    if (prisma?.reservation) {
      try {
        const reservation = await prisma.reservation.update({ where: { jobId }, data });
        // Job도 주소/상태 반영
        if (prisma?.job) {
          const jobUpdate = {};
          if (typeof status !== "undefined") jobUpdate.status = status;
          if (typeof pickupAddr !== "undefined") jobUpdate.pickupAddr = pickupAddr;
          if (typeof dropoffAddr !== "undefined") jobUpdate.dropoffAddr = dropoffAddr;
          if (Object.keys(jobUpdate).length > 0) {
            await prisma.job.update({ where: { jobId }, data: jobUpdate }).catch(() => {});
          }
        } else {
          const j = mem.jobs.get(jobId);
          if (j) {
            if (typeof status !== "undefined") j.status = status;
            if (typeof pickupAddr !== "undefined") j.pickupAddr = pickupAddr;
            if (typeof dropoffAddr !== "undefined") j.dropoffAddr = dropoffAddr;
            j.updatedAt = new Date().toISOString();
          }
        }
        return res.json({ ok: true, reservation });
      } catch (e) {
        if (e.code === "P2025") return res.status(404).json({ ok: false, message: "not found" });
        throw e;
      }
    }

    // 메모리 모드
    const r = mem.reservations.get(jobId);
    if (!r) return res.status(404).json({ ok: false, message: "not found" });
    Object.assign(r, data, { updatedAt: new Date().toISOString() });
    const j = mem.jobs.get(jobId);
    if (j) {
      if (typeof status !== "undefined") j.status = status;
      if (typeof pickupAddr !== "undefined") j.pickupAddr = pickupAddr;
      if (typeof dropoffAddr !== "undefined") j.dropoffAddr = dropoffAddr;
      j.updatedAt = r.updatedAt;
    }
    return res.json({ ok: true, reservation: r });
  } catch {
    res.status(500).json({ ok: false, message: "failed to update reservation" });
  }
});

// ======================= Jobs (DB 우선) =======================
app.get("/v1/jobs", async (req, res) => {
  try {
    const { status, page = 1, size = 10 } = req.query;
    if (status && !ALLOWED_STATUS.includes(status)) return res.status(400).json({ ok: false, message: `status must be one of: ${ALLOWED_STATUS.join(", ")}` });

    if (prisma?.job) {
      const where = status ? { status } : {};
      const { p, s } = clampPageSize(page, size);
      const [total, items] = await Promise.all([
        prisma.job.count({ where }),
        prisma.job.findMany({ where, orderBy: { createdAt: "desc" }, skip: (p - 1) * s, take: s })
      ]);
      return res.json({ ok: true, page: p, size: s, total, pages: Math.max(1, Math.ceil(total / s)), items });
    }

    // fallback
    let items = Array.from(mem.jobs.values());
    if (status) items = items.filter(j => j.status === status);
    items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const paged = paginateArray(items, page, size);
    return res.json({ ok: true, ...paged });
  } catch {
    res.status(500).json({ ok: false, message: "failed to list jobs" });
  }
});

app.get("/v1/jobs/:jobId", async (req, res) => {
  try {
    const jobId = req.params.jobId;
    if (prisma?.job) {
      const job = await prisma.job.findUnique({ where: { jobId } });
      if (!job) return res.status(404).json({ ok: false, message: "not found" });
      return res.json({ ok: true, job });
    }
    const job = mem.jobs.get(jobId);
    if (!job) return res.status(404).json({ ok: false, message: "not found" });
    return res.json({ ok: true, job });
  } catch {
    res.status(500).json({ ok: false, message: "failed to get job" });
  }
});

app.patch("/v1/jobs/:jobId", async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const { status, assignedDriverId } = req.body ?? {};
    if (!status && typeof assignedDriverId === "undefined")
      return res.status(400).json({ ok: false, message: "provide status or assignedDriverId" });
    if (status && !ALLOWED_STATUS.includes(status))
      return res.status(400).json({ ok: false, message: `status must be one of: ${ALLOWED_STATUS.join(", ")}` });

    if (prisma?.job) {
      const data = {};
      if (status) data.status = status;
      if (typeof assignedDriverId !== "undefined") data.assignedDriverId = assignedDriverId || null;

      const job = await prisma.job.update({ where: { jobId }, data }).catch(() => null);
      if (!job) return res.status(404).json({ ok: false, message: "not found" });

      // 🔁 Job → Reservation 상태 동기화
      if (status && prisma?.reservation) {
        await prisma.reservation.update({ where: { jobId }, data: { status } }).catch(() => {});
      }

      return res.json({ ok: true, job });
    }

    // ---- In-memory fallback
    const job = mem.jobs.get(jobId);
    if (!job) return res.status(404).json({ ok: false, message: "not found" });
    if (status) job.status = status;
    if (typeof assignedDriverId !== "undefined") job.assignedDriverId = assignedDriverId || null;
    job.updatedAt = new Date().toISOString();

    // 🔁 Job → Reservation 상태 동기화 (fallback)
    const r = mem.reservations.get(jobId);
    if (r && status) { r.status = status; r.updatedAt = job.updatedAt; }

    return res.json({ ok: true, job });
  } catch {
    res.status(500).json({ ok: false, message: "failed to update job" });
  }
});

// ----- DELETEs -----
app.delete("/v1/reservations/:jobId", async (req, res) => {
  try {
    const jobId = req.params.jobId;

    if (prisma?.reservation) {
      const deleted = await prisma.reservation.delete({ where: { jobId } }).catch(() => null);
      if (!deleted) return res.status(404).json({ ok: false, message: "not found" });
      return res.json({ ok: true, deleted: true });
    }

    const ok = mem.reservations.delete(jobId);
    if (!ok) return res.status(404).json({ ok: false, message: "not found" });
    return res.json({ ok: true, deleted: true });
  } catch {
    res.status(500).json({ ok: false, message: "failed to delete reservation" });
  }
});

app.delete("/v1/jobs/:jobId", async (req, res) => {
  try {
    const jobId = req.params.jobId;

    if (prisma?.job) {
      const deleted = await prisma.job.delete({ where: { jobId } }).catch(() => null);
      if (!deleted) return res.status(404).json({ ok: false, message: "not found" });
      return res.json({ ok: true, deleted: true });
    }

    const ok = mem.jobs.delete(jobId);
    if (!ok) return res.status(404).json({ ok: false, message: "not found" });
    return res.json({ ok: true, deleted: true });
  } catch {
    res.status(500).json({ ok: false, message: "failed to delete job" });
  }
});

// ----- JSON 404
app.use((req, res) => res.status(404).json({ ok: false, message: `Not Found: ${req.method} ${req.path}` }));

// ----- Start (Windows: HOST 고정)
const PORT = 3000, HOST = "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`Reservation API running at http://${HOST}:${PORT}  (Docs: /docs)`);
});

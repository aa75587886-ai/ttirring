// tests/api.p1.test.js
const request = require("supertest");
const app = require("../server/server"); // server.js에서 module.exports = app

describe("Ttirring API - P1 validation & idempotency", () => {
  const PORT = 3000; // supertest는 app 인스턴스로 직접 테스트하므로 포트 사용 안 함

  test("health ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
  });

  test("reservations: invalid channel -> 404 CHANNEL_NOT_FOUND", async () => {
    const payload = {
      userId: "DR-01",
      channelId: "CH-404",
      pickup: { lat: 37.5, lng: 127.0 },
      dropoff: { lat: 37.6, lng: 127.1 },
      scheduledAt: "2025-09-09T09:00:00Z",
      reqId: "REQ-P1-1",
    };
    const res = await request(app)
      .post("/v1/reservations")
      .send(payload)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, error: "CHANNEL_NOT_FOUND" });
  });

  test("wallet debit: USER_NOT_FOUND -> 404", async () => {
    const res = await request(app)
      .post("/v1/wallet_tx/debit")
      .send({
        userId: "NO-USER",
        amount: 1000,
        reason: "FEE",
        jobId: "J0901",
        channelId: "CH-02",
        txId: "TX-P1-U404",
      })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, error: "USER_NOT_FOUND" });
  });

  test("wallet debit: JOB_NOT_FOUND -> 404", async () => {
    const res = await request(app)
      .post("/v1/wallet_tx/debit")
      .send({
        userId: "DR-01",
        amount: 1000,
        reason: "FEE",
        jobId: "J-NOPE",
        channelId: "CH-02",
        txId: "TX-P1-J404",
      })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, error: "JOB_NOT_FOUND" });
  });

  test("wallet debit: idempotent 201 -> 200", async () => {
    const txId = "TX-P1-OK-1";
    const body = {
      userId: "DR-01",
      amount: 1000,
      reason: "FEE",
      jobId: "J0901",
      channelId: "CH-02",
      txId,
    };
    const r1 = await request(app).post("/v1/wallet_tx/debit").send(body);
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ ok: true, tx: { txId, type: "DEBIT" } });

    const r2 = await request(app).post("/v1/wallet_tx/debit").send(body);
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ ok: true, tx: { txId }, idempotent: true });
  });

  test("wallet credit: idempotent 201 -> 200", async () => {
    const txId = "TX-P1-C-1";
    const body = {
      userId: "DR-01",
      amount: 2500,
      reason: "PAYOUT",
      jobId: "J0901",
      channelId: "CH-02",
      txId,
    };
    const r1 = await request(app).post("/v1/wallet_tx/credit").send(body);
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ ok: true, tx: { txId, type: "CREDIT" } });

    const r2 = await request(app).post("/v1/wallet_tx/credit").send(body);
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ ok: true, tx: { txId }, idempotent: true });
  });

  test("jobs stats OK", async () => {
    const res = await request(app).get("/v1/jobs/stats").query({ channelId: "CH-02" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      channelId: "CH-02",
    });
    expect(typeof res.body.total).toBe("number");
    expect(typeof res.body.byStatus).toBe("object");
  });

  test("channel summary: base & manual", async () => {
    const base = await request(app).get("/v1/channel-summary").query({ channelId: "CH-02" });
    expect(base.status).toBe(200);
    expect(base.body).toMatchObject({
      ok: true,
      channelId: "CH-02",
      summary: { jobs: expect.any(Number), amount: expect.any(Number), adjusted: false },
    });

    const manual = await request(app)
      .get("/v1/channel-summary")
      .query({ channelId: "CH-02", adjustFilter: "manual" });
    expect(manual.status).toBe(200);
    expect(manual.body).toMatchObject({
      ok: true,
      channelId: "CH-02",
      summary: { jobs: expect.any(Number), amount: expect.any(Number), adjusted: true },
    });
    // 금액 절반 로직 검증(샘플 데이터 기준 amount 5000 => manual 2500)
    if (base.body?.summary?.amount && manual.body?.summary?.amount) {
      expect(manual.body.summary.amount).toBe(Math.round(base.body.summary.amount / 2));
    }
  });
});

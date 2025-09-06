const request = require("supertest");
const crypto = require("crypto");
const app = require("../server/server");

describe("Ttirring API - P1 smoke", () => {
  test("health ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test("reservation create -> 201", async () => {
    const jobId = "J-T-" + Date.now();
    const res = await request(app).post("/v1/reservations").send({
      jobId,
      channelId: "CH-02",
      passengerName: "홍길동",
      pickupAddr: "서울역",
      dropoffAddr: "성남시",
    });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.reservation.jobId).toBe(jobId);
  });

  test("jobs/stats channel not found -> 404", async () => {
    const res = await request(app).get("/v1/jobs/stats").query({ channelId: "CH-404" });
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.code).toBe("CHANNEL_NOT_FOUND");
  });

  test("wallet debit idempotent: 201 then 200 with same txId", async () => {
    // 미리 job 하나 생성 (debit에서 jobId 존재 확인하므로)
    const jobId = "J-T-" + Date.now();
    await request(app).post("/v1/reservations").send({
      jobId,
      channelId: "CH-02",
      passengerName: "테스트",
      pickupAddr: "A",
      dropoffAddr: "B",
    });

    const key = crypto.randomUUID();
    const body = { userId: "DR-01", amount: 1000, reason: "FEE", jobId, channelId: "CH-02" };

    const r1 = await request(app).post("/v1/wallet_tx/debit").set("Idempotency-Key", key).send(body);
    expect(r1.status).toBe(201);
    expect(r1.body.ok).toBe(true);

    const r2 = await request(app).post("/v1/wallet_tx/debit").set("Idempotency-Key", key).send(body);
    expect(r2.status).toBe(200);
    expect(r2.body.ok).toBe(true);
    expect(r1.body.txId).toBe(r2.body.txId);
  });
});

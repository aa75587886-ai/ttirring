// tests/api.test.js
const request = require("supertest");
const app = require("../server/server");

describe("Ttirring API - P1 smoke", () => {
  test("health ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("wallet debit idempotent", async () => {
    const body = {
      userId: "DR-01",
      amount: 1000,
      reason: "FEE",
      jobId: "J0901",
      channelId: "CH-02",
      txId: "TX-T1",
    };

    // 최초 요청 → 201
    const res1 = await request(app).post("/v1/wallet_tx/debit").send(body);
    expect(res1.status).toBe(201);

    // 같은 txId 다시 요청 → 200 (idempotent)
    const res2 = await request(app).post("/v1/wallet_tx/debit").send(body);
    expect(res2.status).toBe(200);
    expect(res2.body.idempotent).toBe(true);
  });

  test("jobs/stats channel not found", async () => {
    const res = await request(app).get("/v1/jobs/stats?channelId=CH-404");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("CHANNEL_NOT_FOUND");
  });
});

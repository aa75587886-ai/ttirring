// tests/api.test.js
const request = require("supertest");
const app = require("../server/server");

describe("Ttirring API - P1 smoke", () => {
  it("health ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("reservation create -> 201", async () => {
    const body = {
      userId: "DR-01",
      channelId: "CH-02",
      pickup: { lat: 37.5, lng: 127.0 },
      dropoff: { lat: 37.6, lng: 127.1 },
      scheduledAt: "2025-09-10T12:00:00Z",
      reqId: "REQ-TEST",
    };
    const res = await request(app).post("/v1/reservations").send(body);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it("jobs/stats channel not found -> 404", async () => {
    const res = await request(app).get("/v1/jobs/stats?channelId=CH-404");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("CHANNEL_NOT_FOUND");
  });

  it("wallet debit idempotent", async () => {
    const body = {
      userId: "DR-01",
      amount: 1000,
      reason: "FEE",
      jobId: "J0901",
      channelId: "CH-02",
      txId: "TX-TEST",
    };
    const first = await request(app).post("/v1/wallet_tx/debit").send(body);
    expect(first.status).toBe(201);
    const second = await request(app).post("/v1/wallet_tx/debit").send(body);
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
  });
});

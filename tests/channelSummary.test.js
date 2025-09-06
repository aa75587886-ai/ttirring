// tests/channelSummary.test.js
const request = require("supertest");
const app = require("../server/server");

describe("GET /v1/channel-summary", () => {
  test("200 OK - 기본 (adjusted=false) vs manual (adjusted=true) 비교", async () => {
    // baseline
    const base = await request(app)
      .get("/v1/channel-summary")
      .query({ channelId: "CH-02" })
      .expect(200);

    expect(base.body.ok).toBe(true);
    expect(base.body.channelId).toBe("CH-02");
    expect(base.body.summary).toHaveProperty("jobs");
    expect(base.body.summary).toHaveProperty("amount");
    expect(base.body.summary.adjusted).toBe(false);

    // manual
    const manual = await request(app)
      .get("/v1/channel-summary")
      .query({ channelId: "CH-02", adjustFilter: "manual" })
      .expect(200);

    expect(manual.body.ok).toBe(true);
    expect(manual.body.channelId).toBe("CH-02");
    expect(manual.body.summary.adjusted).toBe(true);

    // 금액이 정확히 절반으로 줄었는지 확인
    expect(manual.body.summary.amount * 2).toBe(base.body.summary.amount);
  });

  test("400 - channelId 누락", async () => {
    const r = await request(app).get("/v1/channel-summary").expect(400);
    expect(r.body).toEqual({ ok: false, error: "MISSING_CHANNEL" });
  });

  test("404 - 존재하지 않는 채널", async () => {
    const r = await request(app)
      .get("/v1/channel-summary")
      .query({ channelId: "CH-404" })
      .expect(404);
    expect(r.body).toEqual({ ok: false, error: "CHANNEL_NOT_FOUND" });
  });
});

// tests/reservations.test.js
const request = require("supertest");
const app = require("../server/server");

describe("POST /v1/reservations", () => {
  const baseBody = {
    userId: "DR-01",
    channelId: "CH-02",
    pickup: { lat: 37.5, lng: 127.0 },
    dropoff: { lat: 37.6, lng: 127.1 },
    scheduledAt: "2025-09-06T10:00:00Z",
  };

  test("201 Created - 최초 생성", async () => {
    const r = await request(app)
      .post("/v1/reservations")
      .send({ ...baseBody, reqId: "REQ-XYZ" })
      .expect(201);

    expect(r.body.ok).toBe(true);
    expect(r.body.reservation).toHaveProperty("reservationId");
    expect(r.body.reservation.userId).toBe("DR-01");
  });

  test("200 Idempotent - 같은 reqId 재요청", async () => {
    const r = await request(app)
      .post("/v1/reservations")
      .send({ ...baseBody, reqId: "REQ-XYZ" })
      .expect(200);

    expect(r.body.ok).toBe(true);
    expect(r.body.idempotent).toBe(true);
  });

  test("400 - 필수값 누락", async () => {
    const r = await request(app).post("/v1/reservations").send({}).expect(400);
    expect(r.body).toEqual({ ok: false, error: "MISSING_FIELDS" });
  });

  test("404 - 채널 없음", async () => {
    const r = await request(app)
      .post("/v1/reservations")
      .send({ ...baseBody, channelId: "CH-404" })
      .expect(404);

    expect(r.body).toEqual({ ok: false, error: "CHANNEL_NOT_FOUND" });
  });
});

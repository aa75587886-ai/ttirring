// tests/openapi.test.js
const request = require("supertest");
const app = require("../server/server");

describe("OpenAPI route", () => {
  it("GET /openapi.yaml returns YAML", async () => {
    const res = await request(app).get("/openapi.yaml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/yaml/);

    // BOM 제거 후 첫 줄이 openapi: 인지 확인
    const text = (res.text || "").replace(/^\uFEFF/, "");
    expect(text.startsWith("openapi:")).toBe(true);
  });
});

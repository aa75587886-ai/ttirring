const request = require("supertest");
const app = require("../server/server");

describe("Global headers", () => {
  it("GET /health has X-App-Version and X-Env", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-app-version"]).toBeTruthy();
    expect(res.headers["x-env"]).toBeTruthy();
  });
});

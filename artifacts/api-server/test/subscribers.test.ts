import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../src/app";

vi.mock("../src/lib/kite", () => ({
  getOnChainReputation: vi.fn().mockResolvedValue(null),
  checkOnChainSubscription: vi.fn().mockResolvedValue(null),
  getOnChainSignal: vi.fn().mockResolvedValue(null),
  getSignalRegistry: vi.fn(),
  getReputationRegistry: vi.fn(),
  getSubscriptionPass: vi.fn(),
}));

const FUTURE_EXPIRY = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
const PAST_EXPIRY = new Date(Date.now() - 1000).toISOString();

const BASE_SUBSCRIBER = {
  sessionToken: "test-token-abc123",
  walletAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  tier: "basic",
  expiresAt: FUTURE_EXPIRY,
};

describe("POST /subscribers", () => {
  it("creates subscriber record", async () => {
    const res = await request(app).post("/api/subscribers").send(BASE_SUBSCRIBER);
    expect(res.status).toBe(201);
    expect(res.body.sessionToken).toBe(BASE_SUBSCRIBER.sessionToken);
    expect(res.body.tier).toBe("basic");
  });

  it("with same sessionToken upserts (updates tier and expiry)", async () => {
    await request(app).post("/api/subscribers").send(BASE_SUBSCRIBER);

    const newExpiry = new Date(Date.now() + 14 * 24 * 3_600_000).toISOString();
    const res = await request(app).post("/api/subscribers").send({
      ...BASE_SUBSCRIBER,
      tier: "pro",
      expiresAt: newExpiry,
    });
    expect(res.status).toBe(201);
    expect(res.body.tier).toBe("pro");
  });
});

describe("POST /subscribers/verify", () => {
  it("returns valid: false for unknown token", async () => {
    const res = await request(app)
      .post("/api/subscribers/verify")
      .send({ sessionToken: "does-not-exist" });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
  });

  it("returns valid: false for expired token", async () => {
    await request(app).post("/api/subscribers").send({
      ...BASE_SUBSCRIBER,
      sessionToken: "expired-token-xyz",
      expiresAt: PAST_EXPIRY,
    });
    const res = await request(app)
      .post("/api/subscribers/verify")
      .send({ sessionToken: "expired-token-xyz" });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
  });

  it("returns valid: true with correct fields for active token", async () => {
    await request(app).post("/api/subscribers").send(BASE_SUBSCRIBER);
    const res = await request(app)
      .post("/api/subscribers/verify")
      .send({ sessionToken: BASE_SUBSCRIBER.sessionToken });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.walletAddress).toBe(BASE_SUBSCRIBER.walletAddress);
    expect(res.body.tier).toBe("basic");
    expect(res.body.expiresAt).not.toBeNull();
  });
});

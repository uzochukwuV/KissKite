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

vi.mock("../src/lib/websocket", () => ({
  createWebSocketServer: vi.fn(),
  broadcastSignal: vi.fn(),
  broadcastSettlement: vi.fn(),
  broadcastReputationUpdate: vi.fn(),
  getConnectedCount: vi.fn().mockReturnValue(0),
}));

describe("GET /api/stats", () => {
  it("returns all zeroed counts on clean DB", async () => {
    const res = await request(app).get("/api/stats");
    expect(res.status).toBe(200);
    expect(res.body.totalAgents).toBe(0);
    expect(res.body.activeAgents).toBe(0);
    expect(res.body.totalSignals).toBe(0);
    expect(res.body.pendingSignals).toBe(0);
    expect(res.body.settledSignals).toBe(0);
    expect(res.body.expiredSignals).toBe(0);
    expect(res.body.platformAccuracyRate).toBe(0);
    expect(res.body.totalSubscribers).toBe(0);
  });

  it("counts reflect DB state after seeding agents and signals", async () => {
    const FUTURE_EXPIRY = new Date(Date.now() + 3_600_000).toISOString();

    // Create 2 agents
    const a1 = (await request(app).post("/api/agents").send({
      name: "A1", walletAddress: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    })).body;
    const a2 = (await request(app).post("/api/agents").send({
      name: "A2", walletAddress: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
    })).body;

    // Create a pending signal
    await request(app).post("/api/signals").send({
      agentId: a1.id, asset: "BTC", direction: "BUY",
      targetPrice: "50000", expiration: FUTURE_EXPIRY,
      signalHash: "0x" + "5".repeat(64),
    });

    const res = await request(app).get("/api/stats");
    expect(res.status).toBe(200);
    expect(res.body.totalAgents).toBe(2);
    expect(res.body.activeAgents).toBe(2);
    expect(res.body.totalSignals).toBe(1);
    expect(res.body.pendingSignals).toBe(1);
  });
});

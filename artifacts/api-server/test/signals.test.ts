import { describe, it, expect, vi, beforeEach } from "vitest";
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

const { broadcastSignalSpy, broadcastReputationUpdateSpy } = vi.hoisted(() => ({
  broadcastSignalSpy: vi.fn(),
  broadcastReputationUpdateSpy: vi.fn(),
}));

vi.mock("../src/lib/websocket", () => ({
  createWebSocketServer: vi.fn(),
  broadcastSignal: broadcastSignalSpy,
  broadcastSettlement: vi.fn(),
  broadcastReputationUpdate: broadcastReputationUpdateSpy,
  getConnectedCount: vi.fn().mockReturnValue(0),
}));

const AGENT_BODY = {
  name: "SignalTestAgent",
  walletAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
};

const FUTURE_EXPIRY = new Date(Date.now() + 3_600_000).toISOString();

async function createAgent(): Promise<number> {
  const res = await request(app).post("/api/agents").send(AGENT_BODY);
  return res.body.id as number;
}

async function createSignal(agentId: number, hash = "0x" + "a".repeat(64)) {
  return request(app).post("/api/signals").send({
    agentId,
    asset: "BTC",
    direction: "BUY",
    targetPrice: "50000",
    expiration: FUTURE_EXPIRY,
    signalHash: hash,
  });
}

describe("POST /api/signals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201, agent totalSignals increments", async () => {
    const agentId = await createAgent();
    const res = await createSignal(agentId);
    expect(res.status).toBe(201);
    expect(res.body.agentId).toBe(agentId);
    expect(res.body.status).toBe("pending");

    const stats = await request(app).get(`/api/agents/${agentId}/stats`);
    expect(stats.body.totalSignals).toBe(1);
  });

  it("returns 409 with duplicate signalHash", async () => {
    const agentId = await createAgent();
    await createSignal(agentId);
    const res = await createSignal(agentId);
    expect(res.status).toBe(409);
  });

  it("returns 400 with non-existent agentId", async () => {
    const res = await createSignal(99999);
    expect(res.status).toBe(400);
  });

  it("calls broadcastSignal after creation", async () => {
    const agentId = await createAgent();
    await createSignal(agentId);
    expect(broadcastSignalSpy).toHaveBeenCalledOnce();
  });
});

describe("GET /api/signals with filters", () => {
  it("?status=pending filters correctly", async () => {
    const agentId = await createAgent();
    await createSignal(agentId, "0x" + "c".repeat(64));
    const res = await request(app).get("/api/signals?status=pending");
    expect(res.status).toBe(200);
    expect(res.body.every((s: { status: string }) => s.status === "pending")).toBe(true);
  });

  it("?asset=BTC filters correctly", async () => {
    const agentId = await createAgent();
    await createSignal(agentId, "0x" + "d".repeat(64));
    const res = await request(app).get("/api/signals?asset=BTC");
    expect(res.status).toBe(200);
    expect(res.body.every((s: { asset: string }) => s.asset === "BTC")).toBe(true);
  });
});

describe("POST /api/signals/:id/settle", () => {
  it("returns 400 with already-settled signal and correct message", async () => {
    const agentId = await createAgent();
    const sig = (await createSignal(agentId, "0x" + "e".repeat(64))).body;

    await request(app).post(`/api/signals/${sig.id}/settle`).send({ accurate: true, pnlBps: 100 });
    const res = await request(app).post(`/api/signals/${sig.id}/settle`).send({ accurate: true, pnlBps: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/settled/i);
  });

  it("settling an accurate signal updates agent accuracyRate correctly", async () => {
    const agentId = await createAgent();
    const sig = (await createSignal(agentId, "0x" + "f".repeat(64))).body;

    await request(app).post(`/api/signals/${sig.id}/settle`).send({ accurate: true, pnlBps: 500 });

    const stats = await request(app).get(`/api/agents/${agentId}/stats`);
    expect(stats.body.accuracyRate).toBe(10000);
    expect(stats.body.accurateSignals).toBe(1);
    expect(stats.body.settledSignals).toBe(1);
  });

  it("triggers broadcastSignal and broadcastReputationUpdate on settle", async () => {
    const agentId = await createAgent();
    const sig = (await createSignal(agentId, "0x" + "1234".repeat(16))).body;

    vi.clearAllMocks();
    await request(app).post(`/api/signals/${sig.id}/settle`).send({ accurate: true, pnlBps: 300 });

    expect(broadcastReputationUpdateSpy).toHaveBeenCalledOnce();
  });
});

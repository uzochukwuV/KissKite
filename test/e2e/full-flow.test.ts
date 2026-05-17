import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { WebSocket } from "ws";
import http from "node:http";
import { db, agentsTable, signalsTable, subscribersTable } from "@workspace/db";
import { GetAgentReputationResponse } from "@workspace/api-zod";

// ─── Mock RPC and AI ──────────────────────────────────────────────────────────
vi.mock("../../artifacts/api-server/src/lib/kite", () => ({
  getOnChainReputation: vi.fn().mockResolvedValue({
    totalSignals: 5n,
    settledSignals: 4n,
    accurateSignals: 3n,
    cumulativePnlBps: 840n,
    reputationScore: 7500n,
  }),
  checkOnChainSubscription: vi.fn().mockResolvedValue(null),
  getOnChainSignal: vi.fn().mockResolvedValue(null),
  getSignalRegistry: vi.fn(),
  getReputationRegistry: vi.fn(),
  getSubscriptionPass: vi.fn(),
}));

vi.mock("../../artifacts/api-server/src/lib/websocket", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../artifacts/api-server/src/lib/websocket")>();
  return { ...original };
});

let server: http.Server;
let wsPort: number;
let baseUrl: string;

async function cleanAll(): Promise<void> {
  await db.delete(subscribersTable);
  await db.delete(signalsTable);
  await db.delete(agentsTable);
}

beforeAll(async () => {
  await cleanAll();
  // Import app after mocks are set
  const { default: app } = await import("../../artifacts/api-server/src/app");
  const { createWebSocketServer } = await import("../../artifacts/api-server/src/lib/websocket");
  server = http.createServer(app);
  createWebSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as { port: number };
  wsPort = addr.port;
  baseUrl = `http://localhost:${wsPort}`;
});

afterAll(async () => {
  await cleanAll();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("Full end-to-end flow", () => {
  let agentId: number;
  let signalId: number;
  const WALLET = "0xabc1230000000000000000000000000000000001";
  const FUTURE_EXPIRY = new Date(Date.now() + 3_600_000).toISOString();
  const SESSION_TOKEN = "e2e-session-token-xyz";

  it("1. POST /api/agents — register agent, assert 201", async () => {
    const res = await request(baseUrl).post("/api/agents").send({
      name: "E2EAgent",
      walletAddress: WALLET,
    });
    expect(res.status).toBe(201);
    expect(res.body.walletAddress).toBe(WALLET);
    agentId = res.body.id;
  });

  it("2. POST /api/signals — commit signal, assert 201 status:pending", async () => {
    const res = await request(baseUrl).post("/api/signals").send({
      agentId,
      asset: "BTC",
      direction: "BUY",
      targetPrice: "60000",
      expiration: FUTURE_EXPIRY,
      signalHash: "0x" + "e2e1".repeat(16),
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    signalId = res.body.id;
  });

  it("3. GET /api/signals/:id — assert signal exists and is pending", async () => {
    const res = await request(baseUrl).get(`/api/signals/${signalId}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
    expect(res.body.asset).toBe("BTC");
  });

  it("4. GET /api/agents/:id/stats — totalSignals:1, pendingSignals:1", async () => {
    const res = await request(baseUrl).get(`/api/agents/${agentId}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.totalSignals).toBe(1);
    expect(res.body.pendingSignals).toBe(1);
  });

  it("5. POST /api/signals/:id/settle — settle with accurate:true, pnlBps:420", async () => {
    const res = await request(baseUrl)
      .post(`/api/signals/${signalId}/settle`)
      .send({ accurate: true, pnlBps: 420 });
    expect(res.status).toBe(200);
  });

  it("6. GET /api/signals/:id — status:settled, accurate:true, pnlBps:420", async () => {
    const res = await request(baseUrl).get(`/api/signals/${signalId}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("settled");
    expect(res.body.accurate).toBe(true);
    expect(res.body.pnlBps).toBe(420);
  });

  it("7. GET /api/agents/:id/stats — settledSignals:1, accurateSignals:1, accuracyRate:10000", async () => {
    const res = await request(baseUrl).get(`/api/agents/${agentId}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.settledSignals).toBe(1);
    expect(res.body.accurateSignals).toBe(1);
    expect(res.body.accuracyRate).toBe(10000);
  });

  it("8. GET /api/agents/:id/reputation — valid shape, no registryNotDeployed", async () => {
    const res = await request(baseUrl).get(`/api/agents/${agentId}/reputation`);
    expect(res.status).toBe(200);
    expect(res.body.registryNotDeployed).toBeUndefined();
    expect(res.body.onChain).not.toBeNull();

    const parsed = GetAgentReputationResponse.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });

  it("9. POST /subscribers — register subscriber", async () => {
    const futureExpiry = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
    const res = await request(baseUrl).post("/api/subscribers").send({
      sessionToken: SESSION_TOKEN,
      walletAddress: WALLET,
      tier: "pro",
      expiresAt: futureExpiry,
    });
    expect(res.status).toBe(201);
  });

  it("10. POST /subscribers/verify — assert valid:true with correct tier", async () => {
    const res = await request(baseUrl)
      .post("/api/subscribers/verify")
      .send({ sessionToken: SESSION_TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.tier).toBe("pro");
  });

  it("11. WebSocket — connect with valid session token, receive connected message, then reputation_update on new settle", async () => {
    const wsUrl = `ws://localhost:${wsPort}/ws`;
    const ws = new WebSocket(wsUrl, { headers: { "x-kite-session-token": SESSION_TOKEN } });

    const messages: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WS connect timeout")), 5000);
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as { type: string };
        messages.push(msg.type);
        if (msg.type === "connected") {
          clearTimeout(timeout);
          resolve();
        }
      });
      ws.on("error", reject);
    });

    expect(messages).toContain("connected");

    // Commit and settle a second signal to trigger reputation_update
    const sig2Res = await request(baseUrl).post("/api/signals").send({
      agentId,
      asset: "ETH",
      direction: "BUY",
      targetPrice: "3500",
      expiration: FUTURE_EXPIRY,
      signalHash: "0x" + "e2e2".repeat(16),
    });
    const sig2Id = sig2Res.body.id as number;

    const repUpdatePromise = new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("No reputation_update received")), 5000);
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as { type: string };
        if (msg.type === "reputation_update") {
          clearTimeout(t);
          resolve(msg.type);
        }
      });
    });

    await request(baseUrl).post(`/api/signals/${sig2Id}/settle`).send({ accurate: true, pnlBps: 300 });

    const eventType = await repUpdatePromise;
    expect(eventType).toBe("reputation_update");

    ws.close();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { db, agentsTable } from "@workspace/db";
import { cleanDb } from "./setup";

vi.mock("../src/lib/kite", () => ({
  getOnChainReputation: vi.fn().mockResolvedValue(null),
  checkOnChainSubscription: vi.fn().mockResolvedValue(null),
  getOnChainSignal: vi.fn().mockResolvedValue(null),
  getSignalRegistry: vi.fn(),
  getReputationRegistry: vi.fn(),
  getSubscriptionPass: vi.fn(),
}));

const VALID_AGENT = {
  name: "TestAgent",
  walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  description: "A test agent",
};

describe("GET /api/agents", () => {
  it("returns empty array on clean DB", async () => {
    const res = await request(app).get("/api/agents");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("POST /api/agents", () => {
  it("returns 201 and created agent with valid body", async () => {
    const res = await request(app).post("/api/agents").send(VALID_AGENT);
    expect(res.status).toBe(201);
    expect(res.body.walletAddress).toBe(VALID_AGENT.walletAddress);
    expect(res.body.name).toBe(VALID_AGENT.name);
    expect(typeof res.body.id).toBe("number");
  });

  it("returns 409 with duplicate walletAddress", async () => {
    await request(app).post("/api/agents").send(VALID_AGENT);
    const res = await request(app).post("/api/agents").send(VALID_AGENT);
    expect(res.status).toBe(409);
  });

  it("returns 400 with missing required fields", async () => {
    const res = await request(app).post("/api/agents").send({ description: "no name or wallet" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/agents/:id", () => {
  it("returns 404 for unknown id", async () => {
    const res = await request(app).get("/api/agents/99999");
    expect(res.status).toBe(404);
  });

  it("returns the agent when it exists", async () => {
    const created = await request(app).post("/api/agents").send(VALID_AGENT);
    const res = await request(app).get(`/api/agents/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });
});

describe("PATCH /api/agents/:id", () => {
  it("updates fields and returns updated agent", async () => {
    const created = await request(app).post("/api/agents").send(VALID_AGENT);
    const res = await request(app)
      .patch(`/api/agents/${created.body.id}`)
      .send({ name: "UpdatedName" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("UpdatedName");
  });
});

describe("DELETE /api/agents/:id", () => {
  it("returns 204 and agent is gone from subsequent GET", async () => {
    const created = await request(app).post("/api/agents").send(VALID_AGENT);
    const del = await request(app).delete(`/api/agents/${created.body.id}`);
    expect(del.status).toBe(204);
    const get = await request(app).get(`/api/agents/${created.body.id}`);
    expect(get.status).toBe(404);
  });
});

describe("GET /api/agents/:id/stats", () => {
  it("returns zeroed stats for agent with no signals", async () => {
    const created = await request(app).post("/api/agents").send(VALID_AGENT);
    const res = await request(app).get(`/api/agents/${created.body.id}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.totalSignals).toBe(0);
    expect(res.body.pendingSignals).toBe(0);
    expect(res.body.settledSignals).toBe(0);
    expect(res.body.accurateSignals).toBe(0);
    expect(res.body.accuracyRate).toBe(0);
  });
});

describe("GET /api/agents/:id/signals", () => {
  it("returns only signals belonging to that agent", async () => {
    const agent1 = (await request(app).post("/api/agents").send(VALID_AGENT)).body;
    const agent2 = (await request(app).post("/api/agents").send({
      ...VALID_AGENT,
      walletAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      name: "Agent2",
    })).body;

    const futureExpiry = new Date(Date.now() + 3_600_000).toISOString();

    await request(app).post("/api/signals").send({
      agentId: agent1.id,
      asset: "BTC",
      direction: "BUY",
      targetPrice: "50000",
      expiration: futureExpiry,
      signalHash: "0x" + "a".repeat(64),
    });
    await request(app).post("/api/signals").send({
      agentId: agent2.id,
      asset: "ETH",
      direction: "SELL",
      targetPrice: "3000",
      expiration: futureExpiry,
      signalHash: "0x" + "b".repeat(64),
    });

    const res = await request(app).get(`/api/agents/${agent1.id}/signals`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].asset).toBe("BTC");
  });
});

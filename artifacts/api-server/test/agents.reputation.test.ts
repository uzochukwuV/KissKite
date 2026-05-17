import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { GetAgentReputationResponse } from "@workspace/api-zod";

const { mockGetOnChainReputation } = vi.hoisted(() => ({
  mockGetOnChainReputation: vi.fn(),
}));

vi.mock("../src/lib/kite", () => ({
  getOnChainReputation: mockGetOnChainReputation,
  checkOnChainSubscription: vi.fn().mockResolvedValue(null),
  getOnChainSignal: vi.fn().mockResolvedValue(null),
  getSignalRegistry: vi.fn(),
  getReputationRegistry: vi.fn(),
  getSubscriptionPass: vi.fn(),
}));

const VALID_AGENT = {
  name: "ReputationAgent",
  walletAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
};

describe("GET /api/agents/:id/reputation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetOnChainReputation.mockResolvedValue(null);
  });

  it("returns 404 when agent does not exist", async () => {
    const res = await request(app).get("/api/agents/99999/reputation");
    expect(res.status).toBe(404);
  });

  it("returns combined on-chain + off-chain data when registry is deployed", async () => {
    const mockOnChain = {
      totalSignals: 10n,
      settledSignals: 8n,
      accurateSignals: 6n,
      cumulativePnlBps: 1200n,
      reputationScore: 7500n,
    };
    mockGetOnChainReputation.mockResolvedValue(mockOnChain);

    const created = (await request(app).post("/api/agents").send(VALID_AGENT)).body;
    const res = await request(app).get(`/api/agents/${created.id}/reputation`);

    expect(res.status).toBe(200);
    expect(res.body.onChain).not.toBeNull();
    expect(res.body.onChain.reputationScore).toBe(7500);
    expect(res.body.onChain.totalSignals).toBe(10);
    expect(res.body.registryNotDeployed).toBeUndefined();

    const parsed = GetAgentReputationResponse.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });

  it("returns registryNotDeployed: true when getOnChainReputation returns null", async () => {
    mockGetOnChainReputation.mockResolvedValue(null);

    const created = (await request(app).post("/api/agents").send(VALID_AGENT)).body;
    const res = await request(app).get(`/api/agents/${created.id}/reputation`);

    expect(res.status).toBe(200);
    expect(res.body.onChain).toBeNull();
    expect(res.body.registryNotDeployed).toBe(true);

    const parsed = GetAgentReputationResponse.safeParse(res.body);
    expect(parsed.success).toBe(true);
  });
});

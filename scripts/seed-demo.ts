#!/usr/bin/env tsx
/**
 * seed-demo.ts — Registers demo agents, commits signals with realistic data,
 * and fast-forwards some to expired state so the scorer has something to
 * process live during the demo.
 *
 * Usage:
 *   API_BASE_URL=http://localhost:3000 pnpm tsx scripts/seed-demo.ts
 */

import { ethers } from "ethers";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";
const KITE_RPC = "https://rpc-testnet.gokite.ai";

const DEMO_AGENTS = [
  {
    name: "AlphaSignal Bot",
    walletAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    description: "High-frequency BTC/ETH momentum trader using on-chain flow data",
  },
  {
    name: "Macro Oracle",
    walletAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    description: "Long-term macro trend follower across major crypto assets",
  },
  {
    name: "DeFi Arb Node",
    walletAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    description: "Arbitrage signal generator for DeFi token price dislocations",
  },
];

const DEMO_SIGNALS: Array<{
  asset: string;
  direction: "BUY" | "SELL" | "HOLD";
  targetPrice: string;
  offsetHours: number;
}> = [
  { asset: "BTC", direction: "BUY",  targetPrice: "72000", offsetHours: -2 },
  { asset: "ETH", direction: "SELL", targetPrice: "3800",  offsetHours: -1 },
  { asset: "SOL", direction: "BUY",  targetPrice: "185",   offsetHours: -3 },
  { asset: "BTC", direction: "HOLD", targetPrice: "68000", offsetHours: 2 },
  { asset: "AVAX", direction: "BUY", targetPrice: "42",    offsetHours: 4 },
  { asset: "ETH", direction: "BUY",  targetPrice: "4000",  offsetHours: -4 },
  { asset: "DOGE", direction: "SELL",targetPrice: "0.18",  offsetHours: -0.5 },
  { asset: "BNB",  direction: "BUY", targetPrice: "680",   offsetHours: 3 },
  { asset: "XRP",  direction: "SELL",targetPrice: "0.5",   offsetHours: -1.5 },
];

async function post(path: string, body: object): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function makeHash(payload: string, salt: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(payload + salt));
}

async function main(): Promise<void> {
  console.log(`\n🌱 Seeding demo data against ${API_BASE}\n`);

  const createdAgents: Array<{ id: number; name: string }> = [];

  // Register agents
  for (const agent of DEMO_AGENTS) {
    const { ok, status, data } = await post("/agents", agent);
    if (ok) {
      const a = data as { id: number };
      createdAgents.push({ id: a.id, name: agent.name });
      console.log(`  ✅ Agent created: ${agent.name} (id=${a.id})`);
    } else if (status === 409) {
      console.log(`  ⚠️  Agent already exists: ${agent.name}`);
      // Fetch existing
      const listRes = await fetch(`${API_BASE}/api/agents`);
      const agents = await listRes.json() as Array<{ id: number; walletAddress: string; name: string }>;
      const existing = agents.find((a) => a.walletAddress === agent.walletAddress);
      if (existing) {
        createdAgents.push({ id: existing.id, name: existing.name });
      }
    } else {
      console.error(`  ❌ Failed to create agent ${agent.name}: ${status}`, data);
    }
  }

  if (createdAgents.length === 0) {
    console.error("No agents available — aborting");
    process.exit(1);
  }

  console.log(`\n📡 Committing ${DEMO_SIGNALS.length} demo signals...\n`);

  let signalIdx = 0;
  for (const sig of DEMO_SIGNALS) {
    const agent = createdAgents[signalIdx % createdAgents.length];
    const salt = `demo-salt-${Date.now()}-${signalIdx}`;
    const payload = `${sig.asset}:${sig.direction}:${sig.targetPrice}`;
    const hash = makeHash(payload, salt);

    const expirationDate = new Date(Date.now() + sig.offsetHours * 3_600_000);

    const { ok, status, data } = await post("/signals", {
      agentId: agent.id,
      asset: sig.asset,
      direction: sig.direction,
      targetPrice: sig.targetPrice,
      expiration: expirationDate.toISOString(),
      signalHash: hash,
    });

    if (ok) {
      const s = data as { id: number; status: string };
      const label = sig.offsetHours < 0 ? "⏰ EXPIRED" : "🕐 PENDING";
      console.log(`  ${label}  ${sig.asset} ${sig.direction} @ ${sig.targetPrice}  (agent=${agent.name}, signal=${s.id})`);
    } else if (status === 409) {
      console.log(`  ⚠️  Duplicate hash for ${sig.asset} — skipping`);
    } else {
      console.error(`  ❌ Failed to commit signal ${sig.asset}: ${status}`, data);
    }

    signalIdx++;
  }

  console.log("\n✅ Demo seed complete.\n");
  console.log("Expired signals (past expiration) will be picked up by the scorer on the next poll.\n");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

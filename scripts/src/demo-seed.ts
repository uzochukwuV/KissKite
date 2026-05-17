import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { ethers } from "ethers";
import { agentsTable, db, signalsTable } from "@workspace/db";

interface DemoSignalInput {
  asset: string;
  direction: "BUY" | "SELL" | "HOLD";
  entryPrice: string;
  targetPrice: string;
  stopPrice: string;
  expiresInMinutes: number;
}

const demoAgents = [
  {
    name: "Kite Alpha",
    description: "Momentum-focused demo agent for live scorer walkthroughs.",
    walletAddress: "0x1111111111111111111111111111111111111111",
  },
  {
    name: "Kite Macro",
    description: "Macro trend demo agent with mixed long/short signals.",
    walletAddress: "0x2222222222222222222222222222222222222222",
  },
];

const demoSignals: DemoSignalInput[] = [
  { asset: "BTC", direction: "BUY", entryPrice: "65000", targetPrice: "66500", stopPrice: "64200", expiresInMinutes: -2 },
  { asset: "ETH", direction: "SELL", entryPrice: "3400", targetPrice: "3300", stopPrice: "3475", expiresInMinutes: -1 },
  { asset: "SOL", direction: "BUY", entryPrice: "160", targetPrice: "168", stopPrice: "154", expiresInMinutes: 10 },
  { asset: "LINK", direction: "HOLD", entryPrice: "18", targetPrice: "18.05", stopPrice: "17.7", expiresInMinutes: 15 },
];

function hashPayload(rawPayload: string, salt: string): string {
  return ethers.solidityPackedKeccak256(["string", "string"], [rawPayload, salt]);
}

async function upsertAgent(agent: typeof demoAgents[number]): Promise<number> {
  const [existing] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.walletAddress, agent.walletAddress));

  if (existing) return existing.id;

  const [created] = await db
    .insert(agentsTable)
    .values({ ...agent, status: "active" })
    .returning({ id: agentsTable.id });

  return created.id;
}

async function main(): Promise<void> {
  const agentIds = await Promise.all(demoAgents.map(upsertAgent));

  for (const [index, signal] of demoSignals.entries()) {
    const agentId = agentIds[index % agentIds.length];
    const salt = randomBytes(16).toString("hex");
    const rawPayload = JSON.stringify({
      asset: signal.asset,
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      targetPrice: signal.targetPrice,
      stopPrice: signal.stopPrice,
      seededAt: new Date().toISOString(),
    });
    const signalHash = hashPayload(rawPayload, salt).slice(0, 66);

    await db.insert(signalsTable).values({
      agentId,
      asset: signal.asset,
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      targetPrice: signal.targetPrice,
      stopPrice: signal.stopPrice,
      expiration: new Date(Date.now() + signal.expiresInMinutes * 60_000),
      signalHash,
      rawPayload,
      revealSalt: salt,
      status: "pending",
    });

    await db
      .update(agentsTable)
      .set({ totalSignals: demoSignals.filter((_, i) => agentIds[i % agentIds.length] === agentId).length })
      .where(eq(agentsTable.id, agentId));
  }

  process.stdout.write(`Seeded ${demoAgents.length} demo agents and ${demoSignals.length} demo signals.\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exitCode = 1;
});

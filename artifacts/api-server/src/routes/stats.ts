import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, agentsTable, signalsTable, subscribersTable } from "@workspace/db";
import { GetPlatformStatsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  const [agentStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where status = 'active')::int`,
    })
    .from(agentsTable);

  const [signalStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where status = 'pending')::int`,
      settled: sql<number>`count(*) filter (where status = 'settled')::int`,
      expired: sql<number>`count(*) filter (where status = 'expired')::int`,
      accurate: sql<number>`count(*) filter (where status = 'settled' and accurate = true)::int`,
    })
    .from(signalsTable);

  const [subStats] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(subscribersTable);

  const platformAccuracyRate =
    signalStats.settled > 0
      ? Math.round((signalStats.accurate / signalStats.settled) * 10000)
      : 0;

  res.json(
    GetPlatformStatsResponse.parse({
      totalAgents: agentStats.total,
      activeAgents: agentStats.active,
      totalSignals: signalStats.total,
      pendingSignals: signalStats.pending,
      settledSignals: signalStats.settled,
      expiredSignals: signalStats.expired,
      platformAccuracyRate,
      totalSubscribers: subStats.total,
    })
  );
});

export default router;

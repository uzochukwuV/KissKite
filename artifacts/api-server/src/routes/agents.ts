import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, agentsTable, signalsTable } from "@workspace/db";
import {
  CreateAgentBody,
  UpdateAgentBody,
  GetAgentParams,
  UpdateAgentParams,
  DeleteAgentParams,
  GetAgentStatsParams,
  GetAgentSignalsParams,
  ListAgentsQueryParams,
  ListAgentsResponse,
  GetAgentResponse,
  UpdateAgentResponse,
  GetAgentStatsResponse,
  GetAgentSignalsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/agents", async (req, res): Promise<void> => {
  const query = ListAgentsQueryParams.safeParse(req.query);
  const agents = await db
    .select()
    .from(agentsTable)
    .where(
      query.success && query.data.status
        ? eq(agentsTable.status, query.data.status as "active" | "inactive" | "suspended")
        : undefined
    );
  res.json(ListAgentsResponse.parse(agents));
});

router.post("/agents", async (req, res): Promise<void> => {
  const parsed = CreateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.walletAddress, parsed.data.walletAddress));

  if (existing.length > 0) {
    res.status(409).json({ error: "Wallet address already registered" });
    return;
  }

  const [agent] = await db.insert(agentsTable).values(parsed.data).returning();
  res.status(201).json(GetAgentResponse.parse(agent));
});

router.get("/agents/:id", async (req, res): Promise<void> => {
  const params = GetAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, params.data.id));

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.json(GetAgentResponse.parse(agent));
});

router.patch("/agents/:id", async (req, res): Promise<void> => {
  const params = UpdateAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateAgentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [agent] = await db
    .update(agentsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(agentsTable.id, params.data.id))
    .returning();

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.json(UpdateAgentResponse.parse(agent));
});

router.delete("/agents/:id", async (req, res): Promise<void> => {
  const params = DeleteAgentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [agent] = await db
    .delete(agentsTable)
    .where(eq(agentsTable.id, params.data.id))
    .returning();

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/agents/:id/signals", async (req, res): Promise<void> => {
  const params = GetAgentSignalsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const signals = await db
    .select()
    .from(signalsTable)
    .where(eq(signalsTable.agentId, params.data.id))
    .orderBy(signalsTable.createdAt);

  res.json(GetAgentSignalsResponse.parse(signals));
});

router.get("/agents/:id/stats", async (req, res): Promise<void> => {
  const params = GetAgentStatsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, params.data.id));

  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const statsRows = await db
    .select({
      total: sql<number>`count(*)::int`,
      settled: sql<number>`count(*) filter (where status = 'settled')::int`,
      accurate: sql<number>`count(*) filter (where status = 'settled' and accurate = true)::int`,
      pending: sql<number>`count(*) filter (where status = 'pending')::int`,
      avgPnl: sql<number>`coalesce(avg(pnl_bps) filter (where status = 'settled'), 0)::int`,
    })
    .from(signalsTable)
    .where(eq(signalsTable.agentId, params.data.id));

  const row = statsRows[0];
  const accuracyRate =
    row.settled > 0 ? Math.round((row.accurate / row.settled) * 10000) : 0;

  res.json(
    GetAgentStatsResponse.parse({
      agentId: params.data.id,
      totalSignals: row.total,
      settledSignals: row.settled,
      accurateSignals: row.accurate,
      accuracyRate,
      avgPnlBps: row.avgPnl,
      pendingSignals: row.pending,
    })
  );
});

export default router;

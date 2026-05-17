import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, signalsTable, agentsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { broadcastReputationUpdate, broadcastSignal } from "../lib/websocket";
import {
  CommitSignalBody,
  SettleSignalBody,
  ExpireSignalBody,
  GetSignalParams,
  SettleSignalParams,
  ExpireSignalParams,
  ListSignalsQueryParams,
  ListSignalsResponse,
  GetSignalResponse,
  SettleSignalResponse,
  ExpireSignalResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/signals", async (req, res): Promise<void> => {
  const query = ListSignalsQueryParams.safeParse(req.query);
  const limitVal = query.success && query.data.limit != null ? query.data.limit : 50;
  const offsetVal = query.success && query.data.offset != null ? query.data.offset : 0;

  const conditions = [];
  if (query.success && query.data.status) {
    conditions.push(
      eq(signalsTable.status, query.data.status as "pending" | "settled" | "expired")
    );
  }
  if (query.success && query.data.asset) {
    conditions.push(eq(signalsTable.asset, query.data.asset));
  }

  const signals = await db
    .select()
    .from(signalsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(signalsTable.createdAt)
    .limit(limitVal)
    .offset(offsetVal);

  res.json(ListSignalsResponse.parse(signals));
});

router.post("/signals", async (req, res): Promise<void> => {
  const parsed = CommitSignalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select({ id: signalsTable.id })
    .from(signalsTable)
    .where(eq(signalsTable.signalHash, parsed.data.signalHash));

  if (existing.length > 0) {
    res.status(409).json({ error: "Signal hash already committed" });
    return;
  }

  const [agent] = await db
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.id, parsed.data.agentId));

  if (!agent) {
    res.status(400).json({ error: "Agent not found" });
    return;
  }

  const [signal] = await db
    .insert(signalsTable)
    .values({
      ...parsed.data,
      expiration: new Date(parsed.data.expiration),
    })
    .returning();

  await db
    .update(agentsTable)
    .set({
      totalSignals: sql`${agentsTable.totalSignals} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(agentsTable.id, parsed.data.agentId));

  broadcastSignal(signal);

  res.status(201).json(GetSignalResponse.parse(signal));
});

router.get("/signals/:id", async (req, res): Promise<void> => {
  const params = GetSignalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [signal] = await db
    .select()
    .from(signalsTable)
    .where(eq(signalsTable.id, params.data.id));

  if (!signal) {
    res.status(404).json({ error: "Signal not found" });
    return;
  }

  res.json(GetSignalResponse.parse(signal));
});

router.post("/signals/:id/expire", async (req, res): Promise<void> => {
  const params = ExpireSignalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ExpireSignalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(signalsTable)
    .where(eq(signalsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Signal not found" });
    return;
  }

  if (existing.status !== "pending") {
    res.status(400).json({ error: `Signal is already ${existing.status}` });
    return;
  }

  const [signal] = await db
    .update(signalsTable)
    .set({
      status: "expired",
      expiredReason: parsed.data.reason,
      settledAt: new Date(),
    })
    .where(eq(signalsTable.id, params.data.id))
    .returning();

  res.json(ExpireSignalResponse.parse(signal));
});

router.post("/signals/:id/settle", async (req, res): Promise<void> => {
  const params = SettleSignalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SettleSignalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(signalsTable)
    .where(eq(signalsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Signal not found" });
    return;
  }

  if (existing.status !== "pending") {
    res.status(400).json({ error: `Signal is already ${existing.status}` });
    return;
  }

  const [signal] = await db
    .update(signalsTable)
    .set({
      status: "settled",
      accurate: parsed.data.accurate,
      pnlBps: parsed.data.pnlBps,
      onChainTxHash: parsed.data.onChainTxHash ?? existing.onChainTxHash,
      settledAt: new Date(),
    })
    .where(eq(signalsTable.id, params.data.id))
    .returning();

  const settled = await db
    .select({
      count: sql<number>`count(*)::int`,
      accurate: sql<number>`count(*) filter (where accurate = true)::int`,
    })
    .from(signalsTable)
    .where(
      and(
        eq(signalsTable.agentId, existing.agentId),
        eq(signalsTable.status, "settled")
      )
    );

  const row = settled[0];
  const accuracyRate =
    row.count > 0 ? Math.round((row.accurate / row.count) * 10000) : 0;

  const [updatedAgent] = await db
    .update(agentsTable)
    .set({
      settledSignals: sql`${agentsTable.settledSignals} + 1`,
      accuracyRate,
      updatedAt: new Date(),
    })
    .where(eq(agentsTable.id, existing.agentId))
    .returning({
      id: agentsTable.id,
      walletAddress: agentsTable.walletAddress,
    });

  if (updatedAgent) {
    broadcastReputationUpdate(
      String(updatedAgent.id),
      updatedAgent.walletAddress,
      accuracyRate
    );
  }

  res.json(SettleSignalResponse.parse(signal));
});

export default router;

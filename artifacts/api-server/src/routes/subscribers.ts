import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, subscribersTable } from "@workspace/db";
import {
  RegisterSubscriberBody,
  VerifySubscriberBody,
  VerifySubscriberResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/subscribers", async (req, res): Promise<void> => {
  const parsed = RegisterSubscriberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [subscriber] = await db
    .insert(subscribersTable)
    .values({
      ...parsed.data,
      expiresAt: new Date(parsed.data.expiresAt),
    })
    .onConflictDoUpdate({
      target: subscribersTable.sessionToken,
      set: {
        tier: parsed.data.tier ?? "basic",
        expiresAt: new Date(parsed.data.expiresAt),
      },
    })
    .returning();

  res.status(201).json(subscriber);
});

router.post("/subscribers/verify", async (req, res): Promise<void> => {
  const parsed = VerifySubscriberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [subscriber] = await db
    .select()
    .from(subscribersTable)
    .where(eq(subscribersTable.sessionToken, parsed.data.sessionToken));

  if (!subscriber) {
    res.json(
      VerifySubscriberResponse.parse({
        valid: false,
        walletAddress: null,
        tier: null,
        expiresAt: null,
      })
    );
    return;
  }

  const now = new Date();
  const valid = subscriber.expiresAt > now;

  res.json(
    VerifySubscriberResponse.parse({
      valid,
      walletAddress: valid ? subscriber.walletAddress : null,
      tier: valid ? subscriber.tier : null,
      expiresAt: valid ? subscriber.expiresAt.toISOString() : null,
    })
  );
});

export default router;

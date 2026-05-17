import { db } from "@workspace/db";
import { agentsTable, signalsTable, subscribersTable } from "@workspace/db";
import { afterEach } from "vitest";

export async function cleanDb(): Promise<void> {
  await db.delete(subscribersTable);
  await db.delete(signalsTable);
  await db.delete(agentsTable);
}

afterEach(async () => {
  await cleanDb();
});

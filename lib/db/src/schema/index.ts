import { pgTable, text, serial, timestamp, integer, boolean, bigint, varchar, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const agentStatusEnum = pgEnum("agent_status", ["active", "inactive", "suspended"]);
export const signalDirectionEnum = pgEnum("signal_direction", ["BUY", "SELL", "HOLD"]);
export const signalStatusEnum = pgEnum("signal_status", ["pending", "settled", "expired"]);

// ─── Agents ───────────────────────────────────────────────────────────────────

export const agentsTable = pgTable("agents", {
  id:               serial("id").primaryKey(),
  name:             text("name").notNull(),
  description:      text("description"),
  walletAddress:    varchar("wallet_address", { length: 42 }).notNull().unique(),
  vaultAddress:     varchar("vault_address", { length: 42 }),
  passportId:       text("passport_id"),
  status:           agentStatusEnum("status").notNull().default("active"),
  accuracyRate:     integer("accuracy_rate").notNull().default(0), // 0–10000 bps
  totalSignals:     integer("total_signals").notNull().default(0),
  settledSignals:   integer("settled_signals").notNull().default(0),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;

// ─── Signals ──────────────────────────────────────────────────────────────────

export const signalsTable = pgTable("signals", {
  id:             serial("id").primaryKey(),
  agentId:        integer("agent_id").notNull().references(() => agentsTable.id, { onDelete: "cascade" }),
  asset:          varchar("asset", { length: 20 }).notNull(),        // e.g. "ETH", "BTC"
  direction:      signalDirectionEnum("direction").notNull(),
  entryPrice:     text("entry_price"),                               // stored as string to preserve precision
  targetPrice:    text("target_price").notNull(),                    // stored as string to preserve precision
  stopPrice:      text("stop_price"),                                // stored as string to preserve precision
  expiration:     timestamp("expiration", { withTimezone: true }).notNull(),
  signalHash:     varchar("signal_hash", { length: 66 }).notNull().unique(), // 0x + 64 hex
  rawPayload:     text("raw_payload"),                                // payload revealed on-chain
  revealSalt:     text("reveal_salt"),                                // salt used for commit hash
  onChainTxHash:  varchar("on_chain_tx_hash", { length: 66 }),
  onChainId:      bigint("on_chain_id", { mode: "number" }),
  revealTxHash:   varchar("reveal_tx_hash", { length: 66 }),
  status:         signalStatusEnum("status").notNull().default("pending"),
  accurate:       boolean("accurate"),
  pnlBps:         integer("pnl_bps"),                               // result in basis points
  stakeAmount:    text("stake_amount"),                              // wei as string
  expiredReason:  text("expired_reason"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt:      timestamp("settled_at", { withTimezone: true }),
});

export const insertSignalSchema = createInsertSchema(signalsTable).omit({ id: true, createdAt: true, settledAt: true });
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signalsTable.$inferSelect;

// ─── Subscribers ──────────────────────────────────────────────────────────────

export const subscribersTable = pgTable("subscribers", {
  id:             serial("id").primaryKey(),
  sessionToken:   text("session_token").notNull().unique(),         // Kite Passport session token
  walletAddress:  varchar("wallet_address", { length: 42 }).notNull(),
  tier:           varchar("tier", { length: 20 }).notNull().default("basic"), // basic | pro | elite
  expiresAt:      timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSubscriberSchema = createInsertSchema(subscribersTable).omit({ id: true, createdAt: true });
export type InsertSubscriber = z.infer<typeof insertSubscriberSchema>;
export type Subscriber = typeof subscribersTable.$inferSelect;

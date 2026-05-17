import { setTimeout as sleep } from "node:timers/promises";
import { and, eq, lt } from "drizzle-orm";
import { ethers } from "ethers";
import pino from "pino";
import { z } from "zod";
import { DEPLOYMENTS, ReputationRegistryABI, SignalRegistryABI } from "@workspace/contracts";
import { agentsTable, db, signalsTable, type Agent, type Signal } from "@workspace/db";

const KITE_RPC = "https://rpc-testnet.gokite.ai";
const POLL_INTERVAL_MS = 60_000;
const DASHSCOPE_MODEL = "qwen3-6b-flash";
const DASHSCOPE_URL = "https://dashscope-intl.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1/responses";
const SETTLE_MAX_RETRIES = 4;
const SETTLE_BASE_DELAY_MS = 500;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["DASHSCOPE_API_KEY", "SCORER_PRIVATE_KEY"],
});

export const VerdictSchema = z.object({
  accurate: z.boolean(),
  pnlBps: z.number().finite(),
  reasoning: z.string().min(1),
});

export type Verdict = z.infer<typeof VerdictSchema>;

export type SignalWithOptionalPrices = Signal & {
  entryPrice?: string | null;
  stopPrice?: string | null;
};

const DashscopeOutputTextSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
});

const DashscopeMessageBlockSchema = z.object({
  type: z.literal("message"),
  role: z.string().optional(),
  content: z.array(DashscopeOutputTextSchema),
});

const DashscopeReasoningBlockSchema = z.object({
  type: z.literal("reasoning"),
});

const DashscopeResponseSchema = z.object({
  output: z.array(z.union([DashscopeMessageBlockSchema, DashscopeReasoningBlockSchema, z.object({ type: z.string() })])),
});

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

export function normalizeDirection(direction: string): "long" | "short" | "hold" {
  const lower = direction.toLowerCase();
  if (lower === "buy" || lower === "long") return "long";
  if (lower === "sell" || lower === "short") return "short";
  return "hold";
}

export function parsePrice(value: string | null | undefined, fieldName: string): number {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid ${fieldName}: ${value ?? "missing"}`);
  }
  return price;
}

export function getEntryPrice(signal: SignalWithOptionalPrices): number {
  if (signal.entryPrice) {
    return parsePrice(signal.entryPrice, "entryPrice");
  }
  logger.warn(
    { signalId: signal.id },
    "Signal row has no entryPrice column; using targetPrice as scorer entry reference"
  );
  return parsePrice(signal.targetPrice, "targetPrice");
}

export function coercePnlBps(value: number): number {
  return Math.trunc(value);
}

export function ruleBasedVerdict(signal: SignalWithOptionalPrices, closingPrice: number): Verdict {
  const direction = normalizeDirection(signal.direction);
  const entryPrice = getEntryPrice(signal);

  if (direction === "short") {
    const pnlBps = coercePnlBps(((entryPrice - closingPrice) / entryPrice) * 10_000);
    return {
      accurate: closingPrice <= entryPrice,
      pnlBps,
      reasoning: "Rule-based fallback: short is accurate when closing price is at or below entry price.",
    };
  }

  if (direction === "hold") {
    const driftBps = Math.abs(((closingPrice - entryPrice) / entryPrice) * 10_000);
    return {
      accurate: driftBps <= 50,
      pnlBps: coercePnlBps(-driftBps),
      reasoning: "Rule-based fallback: hold is accurate when closing price remains within 50 bps of entry price.",
    };
  }

  const pnlBps = coercePnlBps(((closingPrice - entryPrice) / entryPrice) * 10_000);
  return {
    accurate: closingPrice >= entryPrice,
    pnlBps,
    reasoning: "Rule-based fallback: long is accurate when closing price is at or above entry price.",
  };
}

export function assetToCoingeckoId(asset: string): string {
  const symbol = asset.toUpperCase().replace(/USDT$|USD$/u, "");
  const known: Record<string, string> = {
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana",
    AVAX: "avalanche-2",
    MATIC: "matic-network",
    POL: "polygon-ecosystem-token",
    LINK: "chainlink",
    UNI: "uniswap",
    DOGE: "dogecoin",
    XRP: "ripple",
    ADA: "cardano",
    BNB: "binancecoin",
  };
  return known[symbol] ?? symbol.toLowerCase();
}

export async function fetchClosingPrice(asset: string): Promise<number> {
  const id = assetToCoingeckoId(asset);
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", id);
  url.searchParams.set("vs_currencies", "usd");

  const apiKey = process.env.COINGECKO_API_KEY;
  if (apiKey) {
    url.searchParams.set("x_cg_demo_api_key", apiKey);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CoinGecko price fetch failed with HTTP ${response.status}`);
  }

  const PriceSchema = z.record(z.string(), z.object({ usd: z.number().positive() }));
  const parsed = PriceSchema.safeParse(await response.json());
  if (!parsed.success || !parsed.data[id]) {
    throw new Error(`CoinGecko did not return a USD price for ${asset}`);
  }

  return parsed.data[id].usd;
}

export function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Qwen response did not contain a JSON object");
  }
  return text.slice(start, end + 1);
}

export async function qwenVerdict(signal: SignalWithOptionalPrices, closingPrice: number): Promise<Verdict> {
  const apiKey = requiredEnv("DASHSCOPE_API_KEY");
  const entryPrice = getEntryPrice(signal);

  const systemPrompt = "You are an objective trading signal evaluator. You will be given a signal's original prediction and actual market outcome. Return ONLY valid JSON with no additional text.";
  const userContent = JSON.stringify({
    signal: {
      asset: signal.asset,
      direction: normalizeDirection(signal.direction),
      entryPrice,
      targetPrice: signal.targetPrice,
      stopPrice: signal.stopPrice ?? null,
      expiration: signal.expiration.toISOString(),
    },
    marketOutcome: { closingPrice },
    expectedJson: { accurate: "boolean", pnlBps: "number", reasoning: "string" },
    accuracyRule: "accurate is true if direction was correct and price moved toward target before hitting stop; pnlBps is basis points PnL from entry to outcome, positive if accurate and negative if not.",
  });

  const response = await fetch(DASHSCOPE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DASHSCOPE_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      enable_thinking: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Qwen scoring failed with HTTP ${response.status}`);
  }

  const rawJson = await response.json() as unknown;
  const parsedResponse = DashscopeResponseSchema.safeParse(rawJson);
  if (!parsedResponse.success) {
    throw new Error("Dashscope response shape was invalid");
  }

  const messageBlock = parsedResponse.data.output.find(
    (block): block is z.infer<typeof DashscopeMessageBlockSchema> => block.type === "message"
  );
  if (!messageBlock) {
    throw new Error("Dashscope response did not include a message block");
  }

  const textContent = messageBlock.content.find(
    (c) => c.type === "output_text" && typeof c.text === "string"
  );
  if (!textContent?.text) {
    throw new Error("Dashscope message block contained no output_text");
  }

  const verdictJson = JSON.parse(extractJsonObject(textContent.text)) as unknown;
  const verdict = VerdictSchema.safeParse(verdictJson);
  if (!verdict.success) {
    throw new Error("Qwen verdict JSON failed validation");
  }

  return { ...verdict.data, pnlBps: coercePnlBps(verdict.data.pnlBps) };
}

export async function scoreSignal(signal: SignalWithOptionalPrices, closingPrice: number): Promise<Verdict> {
  try {
    return await qwenVerdict(signal, closingPrice);
  } catch (err) {
    logger.warn({ err, signalId: signal.id }, "Qwen scoring failed; using rule-based fallback");
    return ruleBasedVerdict(signal, closingPrice);
  }
}

export async function settleViaApi(
  apiBaseUrl: string,
  signalId: number,
  verdict: Verdict,
  maxRetries = SETTLE_MAX_RETRIES
): Promise<void> {
  const url = `${apiBaseUrl.replace(/\/$/u, "")}/api/signals/${signalId}/settle`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = SETTLE_BASE_DELAY_MS * 2 ** (attempt - 1);
      await sleep(delay);
      logger.warn({ signalId, attempt }, "Retrying settlement API call");
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accurate: verdict.accurate, pnlBps: verdict.pnlBps }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Settlement API failed with HTTP ${response.status}: ${body}`);
      }
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn({ err: lastError, signalId, attempt }, "Settlement API attempt failed");
    }
  }

  throw lastError ?? new Error("Settlement failed after all retries");
}

export function resolveOnChainSignalId(signal: Signal): bigint | null {
  if (signal.onChainId != null) {
    return BigInt(signal.onChainId);
  }
  if (!signal.onChainTxHash) {
    return null;
  }
  if (/^\d+$/u.test(signal.onChainTxHash)) {
    return BigInt(signal.onChainTxHash);
  }
  return null;
}

export async function recordReputation(agent: Agent, signal: Signal, verdict: Verdict): Promise<string | null> {
  const onChainSignalId = resolveOnChainSignalId(signal);
  if (onChainSignalId === null) {
    logger.warn(
      { signalId: signal.id, onChainTxHash: signal.onChainTxHash, onChainId: signal.onChainId },
      "Skipping on-chain reputation write because no on-chain signal ID is available"
    );
    return null;
  }

  const privateKey = requiredEnv("SCORER_PRIVATE_KEY");
  const registryAddress = process.env.REPUTATION_REGISTRY_ADDRESS || DEPLOYMENTS.reputationRegistry;
  if (!registryAddress) {
    logger.warn({ signalId: signal.id }, "Skipping on-chain reputation write because ReputationRegistry is not deployed");
    return null;
  }

  const provider = new ethers.JsonRpcProvider(KITE_RPC, { name: "kite-testnet", chainId: 2368 });
  const wallet = new ethers.Wallet(privateKey, provider);
  const registry = new ethers.Contract(registryAddress, ReputationRegistryABI, wallet);
  const tx = await registry.recordSettlement(
    agent.walletAddress,
    verdict.accurate,
    BigInt(verdict.pnlBps),
    onChainSignalId
  ) as ethers.ContractTransactionResponse;
  await tx.wait();
  return tx.hash;
}

export async function revealPendingSignals(): Promise<void> {
  const registryAddress = process.env.SIGNAL_REGISTRY_ADDRESS || DEPLOYMENTS.signalRegistry;
  const privateKey = process.env.SCORER_PRIVATE_KEY;

  if (!registryAddress || !privateKey) {
    logger.warn("Skipping reveal automation: SIGNAL_REGISTRY_ADDRESS or SCORER_PRIVATE_KEY not set");
    return;
  }

  const soon = new Date(Date.now() + 10 * 60_000);
  const rows = await db
    .select({ signal: signalsTable })
    .from(signalsTable)
    .where(
      and(
        eq(signalsTable.status, "pending"),
        lt(signalsTable.expiration, soon)
      )
    );

  if (rows.length === 0) return;

  const provider = new ethers.JsonRpcProvider(KITE_RPC, { name: "kite-testnet", chainId: 2368 });
  const wallet = new ethers.Wallet(privateKey, provider);
  const registry = new ethers.Contract(registryAddress, SignalRegistryABI, wallet);

  for (const { signal } of rows) {
    if (!signal.onChainId) {
      logger.debug({ signalId: signal.id }, "Skipping reveal: no onChainId");
      continue;
    }

    try {
      const [, , , , revealed] = await registry.getSignal(BigInt(signal.onChainId)) as [unknown, unknown, unknown, unknown, boolean];
      if (revealed) {
        logger.debug({ signalId: signal.id }, "Signal already revealed on-chain");
        continue;
      }
      logger.warn(
        { signalId: signal.id, onChainId: signal.onChainId },
        "Signal not yet revealed — store rawPayload+salt in DB to enable auto-reveal"
      );
    } catch (err) {
      logger.error({ err, signalId: signal.id }, "Failed to check reveal status");
    }
  }
}

export async function markExpiredSignals(): Promise<number> {
  const now = new Date();
  const result = await db
    .update(signalsTable)
    .set({ status: "expired", settledAt: now })
    .where(
      and(
        eq(signalsTable.status, "pending"),
        lt(signalsTable.expiration, now)
      )
    )
    .returning({ id: signalsTable.id });

  if (result.length > 0) {
    logger.info({ count: result.length, ids: result.map((r) => r.id) }, "Marked signals as expired");
  }

  return result.length;
}

export async function processSignal(apiBaseUrl: string, signal: Signal, agent: Agent): Promise<void> {
  const closingPrice = await fetchClosingPrice(signal.asset);
  const scoredSignal = signal as SignalWithOptionalPrices;
  const verdict = await scoreSignal(scoredSignal, closingPrice);

  await settleViaApi(apiBaseUrl, signal.id, verdict);

  let onChainTxHash: string | null = null;
  try {
    onChainTxHash = await recordReputation(agent, signal, verdict);
  } catch (err) {
    logger.error({ err, signalId: signal.id }, "On-chain reputation write failed after DB settlement");
  }

  logger.info(
    {
      signalId: signal.id,
      asset: signal.asset,
      direction: signal.direction,
      entryPrice: getEntryPrice(scoredSignal),
      closingPrice,
      accurate: verdict.accurate,
      pnlBps: verdict.pnlBps,
      reasoning: verdict.reasoning.slice(0, 100),
      onChainTxHash,
    },
    "Signal processed by scorer"
  );
}

const _processedInCycle = new Set<number>();

export async function pollOnce(apiBaseUrl: string): Promise<void> {
  _processedInCycle.clear();

  const rows = await db
    .select({ signal: signalsTable, agent: agentsTable })
    .from(signalsTable)
    .innerJoin(agentsTable, eq(signalsTable.agentId, agentsTable.id))
    .where(and(eq(signalsTable.status, "pending"), lt(signalsTable.expiration, new Date())));

  if (rows.length === 0) {
    logger.info("No expired pending signals found");
    return;
  }

  logger.info({ count: rows.length }, "Expired pending signals found");

  for (const row of rows) {
    if (_processedInCycle.has(row.signal.id)) {
      logger.warn({ signalId: row.signal.id }, "Signal already processed in this cycle — skipping duplicate");
      continue;
    }
    _processedInCycle.add(row.signal.id);

    try {
      await processSignal(apiBaseUrl, row.signal, row.agent);
    } catch (err) {
      logger.error({ err, signalId: row.signal.id }, "Failed to process signal");
    }
  }
}

async function validateStartup(): Promise<void> {
  const required = ["DATABASE_URL", "API_BASE_URL", "DASHSCOPE_API_KEY", "SCORER_PRIVATE_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  const privateKey = process.env.SCORER_PRIVATE_KEY!;
  const provider = new ethers.JsonRpcProvider(KITE_RPC, { name: "kite-testnet", chainId: 2368 });

  const blockNumber = await Promise.race([
    provider.getBlockNumber(),
    sleep(8_000).then(() => { throw new Error("Kite RPC timed out after 8 s"); }),
  ]) as number;
  logger.info({ blockNumber, rpc: KITE_RPC }, "Kite RPC reachable");

  const wallet = new ethers.Wallet(privateKey);
  const balance = await provider.getBalance(wallet.address);
  const minBalance = ethers.parseEther("0.005");
  if (balance < minBalance) {
    logger.warn(
      { balance: ethers.formatEther(balance), address: wallet.address },
      "Scorer wallet balance is low — may not have enough gas for on-chain writes"
    );
  } else {
    logger.info({ balance: ethers.formatEther(balance), address: wallet.address }, "Scorer wallet gas OK");
  }
}

async function main(): Promise<void> {
  await validateStartup();

  const apiBaseUrl = process.env.API_BASE_URL!;
  logger.info({ pollIntervalMs: POLL_INTERVAL_MS, model: DASHSCOPE_MODEL }, "Kite scorer started");

  for (;;) {
    try {
      await revealPendingSignals();
      await pollOnce(apiBaseUrl);
    } catch (err) {
      logger.error({ err }, "Unexpected error in poll cycle");
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

main().catch((err) => {
  logger.error({ err }, "Kite scorer exited unexpectedly");
  process.exitCode = 1;
});

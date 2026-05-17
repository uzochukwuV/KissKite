import { setTimeout as sleep } from "node:timers/promises";
import { and, eq, gt, lt, isNull } from "drizzle-orm";
import { ethers } from "ethers";
import pino from "pino";
import { z } from "zod";
import { DEPLOYMENTS, ReputationRegistryABI, SignalRegistryABI } from "@workspace/contracts";
import { agentsTable, db, signalsTable, type Agent, type Signal } from "@workspace/db";

const KITE_RPC = "https://rpc-testnet.gokite.ai";
const POLL_INTERVAL_MS = 60_000;
noconst MIN_GAS_WEI = 10_000_000_000_000n; // 0.00001 testnet ETH
const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const MAX_RETRY_ATTEMPTS = 3;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["ANTHROPIC_API_KEY", "SCORER_PRIVATE_KEY", "AGENT_PRIVATE_KEYS"],
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
  rawPayload?: string | null;
  revealSalt?: string | null;
  revealTxHash?: string | null;
  expiredReason?: string | null;
};

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

const AnthropicResponseSchema = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
    })
  ),
});

interface StartupConfig {
  apiBaseUrl: string;
  scorerPrivateKey: string;
  reputationRegistryAddress: string;
  anthropicApiKey: string;
  databaseUrl: string;
  provider: ethers.JsonRpcProvider;
  scorerWallet: ethers.Wallet;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

function normalizeDirection(direction: string): "long" | "short" | "hold" {
  const lower = direction.toLowerCase();
  if (lower === "buy" || lower === "long") return "long";
  if (lower === "sell" || lower === "short") return "short";
  return "hold";
}

function parsePrice(value: string | null | undefined, fieldName: string): number {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid ${fieldName}: ${value ?? "missing"}`);
  }
  return price;
}

function getEntryPrice(signal: SignalWithOptionalPrices): number {
  if (signal.entryPrice) {
    return parsePrice(signal.entryPrice, "entryPrice");
  }

  logger.warn(
    { signalId: signal.id },
    "Signal row has no entryPrice column; using targetPrice as scorer entry reference"
  );
  return parsePrice(signal.targetPrice, "targetPrice");
}

function coercePnlBps(value: number): number {
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

function assetToCoingeckoId(asset: string): string {
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
  if (process.env.COINGECKO_API_KEY) {
    url.searchParams.set("x_cg_demo_api_key", process.env.COINGECKO_API_KEY);
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

function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Claude response did not contain a JSON object");
  }
  return text.slice(start, end + 1);
}

export async function claudeVerdict(signal: SignalWithOptionalPrices, closingPrice: number): Promise<Verdict> {
  const apiKey = requiredEnv("ANTHROPIC_API_KEY");
  const entryPrice = getEntryPrice(signal);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      temperature: 0,
      system: "You are an objective trading signal evaluator. You will be given a signal's original prediction and actual market outcome. Return ONLY valid JSON.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
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
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude scoring failed with HTTP ${response.status}`);
  }

  const parsedResponse = AnthropicResponseSchema.safeParse(await response.json());
  if (!parsedResponse.success) {
    throw new Error("Claude response shape was invalid");
  }

  const textBlock = parsedResponse.data.content.find(
    (block): block is AnthropicTextBlock => block.type === "text" && typeof block.text === "string"
  );
  if (!textBlock) {
    throw new Error("Claude response did not include text content");
  }

  const verdictJson = JSON.parse(extractJsonObject(textBlock.text)) as unknown;
  const verdict = VerdictSchema.safeParse(verdictJson);
  if (!verdict.success) {
    throw new Error("Claude verdict JSON failed validation");
  }

  return { ...verdict.data, pnlBps: coercePnlBps(verdict.data.pnlBps) };
}

export async function scoreSignal(signal: SignalWithOptionalPrices, closingPrice: number): Promise<Verdict> {
  try {
    return await claudeVerdict(signal, closingPrice);
  } catch (err) {
    logger.warn({ err, signalId: signal.id }, "Claude scoring failed; using rule-based fallback");
    return ruleBasedVerdict(signal, closingPrice);
  }
}

async function withRetry<T>(operationName: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRY_ATTEMPTS) break;
      const delayMs = 500 * 2 ** (attempt - 1);
      logger.warn({ err, operationName, attempt, delayMs }, "Operation failed; retrying");
      await sleep(delayMs);
    }
  }
  throw lastError;
}

export async function settleViaApi(apiBaseUrl: string, signalId: number, verdict: Verdict): Promise<void> {
  await withRetry("settleViaApi", async () => {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/u, "")}/api/signals/${signalId}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accurate: verdict.accurate, pnlBps: verdict.pnlBps }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Settlement API failed with HTTP ${response.status}: ${body}`);
    }
  });
}

export async function expireViaApi(apiBaseUrl: string, signalId: number, reason: string): Promise<void> {
  await withRetry("expireViaApi", async () => {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/u, "")}/api/signals/${signalId}/expire`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Expire API failed with HTTP ${response.status}: ${body}`);
    }
  });
}

function resolveOnChainSignalId(signal: Signal): bigint | null {
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

function loadAgentPrivateKeys(): Map<string, string> {
  const raw = process.env.AGENT_PRIVATE_KEYS;
  if (!raw) return new Map();

  const parsed = z.record(z.string(), z.string()).safeParse(JSON.parse(raw) as unknown);
  if (!parsed.success) {
    throw new Error("AGENT_PRIVATE_KEYS must be a JSON object of walletAddress to privateKey");
  }

  return new Map(
    Object.entries(parsed.data).map(([walletAddress, privateKey]) => [
      walletAddress.toLowerCase(),
      privateKey,
    ])
  );
}

function getRevealWallet(
  agent: Agent,
  provider: ethers.JsonRpcProvider,
  scorerWallet: ethers.Wallet
): ethers.Wallet | null {
  if (scorerWallet.address.toLowerCase() === agent.walletAddress.toLowerCase()) {
    return scorerWallet;
  }

  const privateKey = loadAgentPrivateKeys().get(agent.walletAddress.toLowerCase());
  return privateKey ? new ethers.Wallet(privateKey, provider) : null;
}

async function revealSignalOnChain(
  provider: ethers.JsonRpcProvider,
  scorerWallet: ethers.Wallet,
  agent: Agent,
  signal: SignalWithOptionalPrices
): Promise<string | null> {
  if (!DEPLOYMENTS.signalRegistry || !signal.rawPayload || !signal.revealSalt || signal.revealTxHash) {
    return null;
  }

  const onChainSignalId = resolveOnChainSignalId(signal);
  if (onChainSignalId === null) return null;

  const revealWallet = getRevealWallet(agent, provider, scorerWallet);
  if (!revealWallet) {
    logger.warn({ signalId: signal.id, walletAddress: agent.walletAddress }, "No agent private key available for reveal automation");
    return null;
  }

  const registry = new ethers.Contract(DEPLOYMENTS.signalRegistry, SignalRegistryABI, revealWallet);
  const tx = await registry.revealSignal(onChainSignalId, signal.rawPayload, signal.revealSalt) as ethers.ContractTransactionResponse;
  await tx.wait();

  await db
    .update(signalsTable)
    .set({ revealTxHash: tx.hash })
    .where(eq(signalsTable.id, signal.id));

  logger.info({ signalId: signal.id, onChainTxHash: tx.hash }, "Signal revealed on-chain");
  return tx.hash;
}

export async function recordReputation(
  agent: Agent,
  signal: Signal,
  verdict: Verdict,
  provider: ethers.JsonRpcProvider,
  scorerWallet: ethers.Wallet
): Promise<string | null> {
  const onChainSignalId = resolveOnChainSignalId(signal);
  if (onChainSignalId === null) {
    logger.warn(
      { signalId: signal.id, onChainTxHash: signal.onChainTxHash, onChainId: signal.onChainId },
      "Skipping on-chain reputation write because no on-chain signal ID is available"
    );
    return null;
  }

  const registryAddress = process.env.REPUTATION_REGISTRY_ADDRESS || DEPLOYMENTS.reputationRegistry;
  if (!registryAddress) {
    logger.warn({ signalId: signal.id }, "Skipping on-chain reputation write because ReputationRegistry is not deployed");
    return null;
  }

  const registry = new ethers.Contract(registryAddress, ReputationRegistryABI, scorerWallet.connect(provider));
  const tx = await registry.recordSettlement(
    agent.walletAddress,
    verdict.accurate,
    BigInt(verdict.pnlBps),
    onChainSignalId
  ) as ethers.ContractTransactionResponse;
  await tx.wait();
  return tx.hash;
}

async function isSignalRevealedOnChain(
  provider: ethers.JsonRpcProvider,
  signal: Signal
): Promise<boolean> {
  if (!DEPLOYMENTS.signalRegistry) return false;
  const onChainSignalId = resolveOnChainSignalId(signal);
  if (onChainSignalId === null) return false;

  const registry = new ethers.Contract(DEPLOYMENTS.signalRegistry, SignalRegistryABI, provider);
  const [, , , , revealed] = await registry.getSignal(onChainSignalId) as [
    string,
    string,
    bigint,
    bigint,
    boolean,
  ];
  return revealed;
}

export async function processSignal(
  apiBaseUrl: string,
  signal: Signal,
  agent: Agent,
  provider: ethers.JsonRpcProvider,
  scorerWallet: ethers.Wallet
): Promise<void> {
  const scoredSignal = signal as SignalWithOptionalPrices;
  if (resolveOnChainSignalId(signal) !== null && !scoredSignal.revealTxHash) {
    const revealedOnChain = await isSignalRevealedOnChain(provider, signal);
    if (!revealedOnChain) {
      await expireViaApi(apiBaseUrl, signal.id, "Signal expired before on-chain reveal was observed");
      logger.warn({ signalId: signal.id }, "Expired signal instead of settling because reveal was not completed");
      return;
    }
  }

  const closingPrice = await fetchClosingPrice(signal.asset);
  const verdict = await scoreSignal(scoredSignal, closingPrice);

  await settleViaApi(apiBaseUrl, signal.id, verdict);

  let onChainTxHash: string | null = null;
  try {
    onChainTxHash = await recordReputation(agent, signal, verdict, provider, scorerWallet);
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

export async function revealPendingSignals(
  provider: ethers.JsonRpcProvider,
  scorerWallet: ethers.Wallet
): Promise<void> {
  const rows = await db
    .select({ signal: signalsTable, agent: agentsTable })
    .from(signalsTable)
    .innerJoin(agentsTable, eq(signalsTable.agentId, agentsTable.id))
    .where(and(eq(signalsTable.status, "pending"), gt(signalsTable.expiration, new Date()), isNull(signalsTable.revealTxHash)));

  for (const row of rows) {
    try {
      await revealSignalOnChain(provider, scorerWallet, row.agent, row.signal as SignalWithOptionalPrices);
    } catch (err) {
      logger.error({ err, signalId: row.signal.id }, "Signal reveal automation failed");
    }
  }
}

export async function pollOnce(
  apiBaseUrl: string,
  provider: ethers.JsonRpcProvider,
  scorerWallet: ethers.Wallet
): Promise<void> {
  await revealPendingSignals(provider, scorerWallet);

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

  const processed = new Set<number>();
  for (const row of rows) {
    if (processed.has(row.signal.id)) continue;
    processed.add(row.signal.id);

    try {
      await processSignal(apiBaseUrl, row.signal, row.agent, provider, scorerWallet);
    } catch (err) {
      logger.error({ err, signalId: row.signal.id }, "Failed to process signal");
    }
  }
}

export async function validateStartup(): Promise<StartupConfig> {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const apiBaseUrl = requiredEnv("API_BASE_URL");
  const anthropicApiKey = requiredEnv("ANTHROPIC_API_KEY");
  const scorerPrivateKey = requiredEnv("SCORER_PRIVATE_KEY");
  const reputationRegistryAddress = requiredEnv("REPUTATION_REGISTRY_ADDRESS");

  const provider = new ethers.JsonRpcProvider(KITE_RPC, { name: "kite-testnet", chainId: 2368 });
  const network = await provider.getNetwork();
  if (network.chainId !== 2368n) {
    throw new Error(`Kite RPC returned unexpected chainId ${network.chainId.toString()}`);
  }

  const scorerWallet = new ethers.Wallet(scorerPrivateKey, provider);
  const balance = await provider.getBalance(scorerWallet.address);
  if (balance < MIN_GAS_WEI) {
    throw new Error(`Scorer wallet ${scorerWallet.address} has insufficient gas: ${balance.toString()} wei`);
  }

  logger.info(
    { scorerWallet: scorerWallet.address, chainId: network.chainId.toString(), gasWei: balance.toString() },
    "Scorer startup validation passed"
  );

  return {
    apiBaseUrl,
    scorerPrivateKey,
    reputationRegistryAddress,
    anthropicApiKey,
    databaseUrl,
    provider,
    scorerWallet,
  };
}

export async function main(): Promise<void> {
  const config = await validateStartup();
  logger.info({ pollIntervalMs: POLL_INTERVAL_MS }, "Kite scorer started");

  for (;;) {
    await pollOnce(config.apiBaseUrl, config.provider, config.scorerWallet);
    await sleep(POLL_INTERVAL_MS);
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((err) => {
    logger.error({ err }, "Kite scorer exited unexpectedly");
    process.exitCode = 1;
  });
}

/**
 * kite.ts — Typed contract client helpers for the Kite Signal Platform.
 *
 * Exposes two factory functions that return typed ethers v6 Contract instances
 * connected to the Kite Testnet RPC. Import these in route handlers and
 * background workers — never construct raw Contract objects with ABI strings
 * elsewhere in application code.
 *
 * Design principles:
 * - Auth-critical paths throw explicitly — callers decide whether to degrade or reject.
 * - Provider is a lazy singleton to avoid re-creating connections per request.
 * - All contract-not-deployed states produce actionable error messages.
 */

import { ethers } from "ethers";
import {
  SignalRegistryABI,
  SubscriptionPassABI,
  ReputationRegistryABI,
  DEPLOYMENTS,
  type OnChainSignal,
  type OnChainReputation,
  type SubscriptionPassStatus,
} from "@workspace/contracts";
import { logger } from "./logger.js";

const KITE_RPC = "https://rpc-testnet.gokite.ai";

// ─── Provider singleton ───────────────────────────────────────────────────────

let _provider: ethers.JsonRpcProvider | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(KITE_RPC, {
      name:    "kite-testnet",
      chainId: 2368,
    });
    logger.info({ rpc: KITE_RPC }, "Kite RPC provider initialized");
  }
  return _provider;
}

// ─── Contract address guards ──────────────────────────────────────────────────

function requireSignalRegistryAddress(): string {
  const addr = DEPLOYMENTS.signalRegistry;
  if (!addr) {
    throw new Error(
      "SignalRegistry address is not set. " +
      "Deploy contracts first, then set SIGNAL_REGISTRY_ADDRESS in Secrets."
    );
  }
  return addr;
}

function requireSubscriptionPassAddress(): string {
  const addr = DEPLOYMENTS.subscriptionPass;
  if (!addr) {
    throw new Error(
      "SubscriptionPass address is not set. " +
      "Deploy contracts first, then set SUBSCRIPTION_PASS_ADDRESS in Secrets."
    );
  }
  return addr;
}

function requireReputationRegistryAddress(): string {
  const addr = DEPLOYMENTS.reputationRegistry;
  if (!addr) {
    throw new Error(
      "ReputationRegistry address is not set. " +
      "Deploy contracts first, then set REPUTATION_REGISTRY_ADDRESS in Secrets."
    );
  }
  return addr;
}

// ─── Signal Registry ──────────────────────────────────────────────────────────

/**
 * Returns a read-only Contract instance for SignalRegistry.
 * Use for view calls: getSignal, getAgentSignalIds, nextSignalId.
 */
export function getSignalRegistry(): ethers.Contract {
  return new ethers.Contract(
    requireSignalRegistryAddress(),
    SignalRegistryABI,
    getProvider()
  );
}

// ─── Subscription Pass ────────────────────────────────────────────────────────

/**
 * Returns a read-only Contract instance for SubscriptionPass.
 * Use for isActive() checks during subscription verification.
 */
export function getSubscriptionPass(): ethers.Contract {
  return new ethers.Contract(
    requireSubscriptionPassAddress(),
    SubscriptionPassABI,
    getProvider()
  );
}

// ─── Reputation Registry ─────────────────────────────────────────────────────

/**
 * Returns a read-only Contract instance for ReputationRegistry.
 * Use for view calls: getReputation, getScore, signalRecorded.
 */
export function getReputationRegistry(): ethers.Contract {
  return new ethers.Contract(
    requireReputationRegistryAddress(),
    ReputationRegistryABI,
    getProvider()
  );
}

// ─── On-chain helpers ─────────────────────────────────────────────────────────

/**
 * Check on-chain whether a wallet holds an active subscription pass.
 *
 * The SubscriptionPass contract performs dual verification:
 *   - balanceOf(subscriber, tier) > 0  (soulbound token ownership)
 *   - expiresAt > block.timestamp      (not expired)
 *
 * Returns null ONLY when the contract is not yet deployed (address absent).
 * Throws on RPC/contract errors — callers must handle explicitly; do NOT
 * silently grant access on failure.
 */
export async function checkOnChainSubscription(
  walletAddress: string
): Promise<SubscriptionPassStatus | null> {
  if (!DEPLOYMENTS.subscriptionPass) {
    logger.warn(
      { walletAddress },
      "SubscriptionPass not deployed — skipping on-chain check"
    );
    return null;
  }

  const pass = getSubscriptionPass();
  const [active, tier, expiresAt] = await pass.isActive(walletAddress) as [
    boolean,
    bigint,
    bigint,
  ];

  return { active, tier: Number(tier), expiresAt };
}

/**
 * Fetch a committed signal record from the chain by its on-chain ID.
 *
 * Returns null ONLY when the contract is not yet deployed.
 * Throws on RPC/contract errors — callers must handle or propagate.
 */
export async function getOnChainSignal(
  onChainId: number
): Promise<OnChainSignal | null> {
  if (!DEPLOYMENTS.signalRegistry) {
    logger.warn(
      { onChainId },
      "SignalRegistry not deployed — skipping on-chain fetch"
    );
    return null;
  }

  const registry = getSignalRegistry();
  const [hash, agent, committedAt, expiration, revealed] =
    await registry.getSignal(BigInt(onChainId)) as [
      string,
      string,
      bigint,
      bigint,
      boolean,
    ];

  return { hash, agent, committedAt, expiration, revealed };
}

/**
 * Fetch an agent reputation record from the chain.
 *
 * Returns null ONLY when the contract is not yet deployed.
 * Throws on RPC/contract errors — callers must handle explicitly.
 */
export async function getOnChainReputation(
  walletAddress: string
): Promise<OnChainReputation | null> {
  if (!DEPLOYMENTS.reputationRegistry) {
    logger.warn(
      { walletAddress },
      "ReputationRegistry not deployed — skipping on-chain reputation fetch"
    );
    return null;
  }

  const registry = getReputationRegistry();
  const [totalSignals, settledSignals, accurateSignals, cumulativePnlBps, reputationScore] =
    await registry.getReputation(walletAddress) as [
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
    ];

  return {
    totalSignals,
    settledSignals,
    accurateSignals,
    cumulativePnlBps,
    reputationScore,
  };
}

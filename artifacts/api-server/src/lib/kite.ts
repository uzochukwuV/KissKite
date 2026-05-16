/**
 * kite.ts — Typed contract client helpers for the Kite Signal Platform.
 *
 * Exposes factory functions that return typed ethers v6 Contract instances
 * connected to the Kite Testnet RPC. Import these in route handlers and
 * background workers — never construct raw Contract objects with ABI strings
 * elsewhere in application code.
 *
 * Design principles:
 * - Auth-critical paths (checkOnChainSubscription, getOnChainSignal) throw
 *   explicitly — callers decide whether to degrade or reject.
 * - Provider and signer are lazy singletons to avoid re-creating connections
 *   per request.
 * - All contract-not-deployed states produce actionable error messages.
 */

import { ethers } from "ethers";
import {
  SignalRegistryABI,
  SubscriptionPassABI,
  DEPLOYMENTS,
  type OnChainSignal,
  type SubscriptionPassStatus,
} from "@workspace/contracts";
import { logger } from "./logger.js";

const KITE_RPC = "https://rpc-testnet.gokite.ai";

// ─── Provider & signer singletons ────────────────────────────────────────────

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

let _signer: ethers.Wallet | null = null;

function getSigner(): ethers.Wallet {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) {
    throw new Error("DEPLOYER_PRIVATE_KEY is not set — cannot sign transactions");
  }
  if (!_signer) {
    _signer = new ethers.Wallet(key, getProvider());
    logger.info({ address: _signer.address }, "Kite signer wallet initialized");
  }
  return _signer;
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

// ─── Signal Registry ──────────────────────────────────────────────────────────

/**
 * Read-only Contract instance for SignalRegistry.
 * Use for view calls: getSignal, getAgentSignalIds, etc.
 */
export function getSignalRegistry(): ethers.Contract {
  return new ethers.Contract(
    requireSignalRegistryAddress(),
    SignalRegistryABI,
    getProvider()
  );
}

/**
 * Signer-connected Contract instance for SignalRegistry.
 * Use for write calls from the keeper: settleSignal, markExpired.
 */
export function getSignalRegistryWriter(): ethers.Contract {
  return new ethers.Contract(
    requireSignalRegistryAddress(),
    SignalRegistryABI,
    getSigner()
  );
}

// ─── Subscription Pass ────────────────────────────────────────────────────────

/**
 * Read-only Contract instance for SubscriptionPass.
 * Use for isActive() checks during subscription verification.
 */
export function getSubscriptionPass(): ethers.Contract {
  return new ethers.Contract(
    requireSubscriptionPassAddress(),
    SubscriptionPassABI,
    getProvider()
  );
}

// ─── On-chain helpers ─────────────────────────────────────────────────────────

/**
 * Check on-chain whether a wallet holds an active subscription pass.
 *
 * The SubscriptionPass contract performs dual verification:
 *   - balanceOf(subscriber, tier) > 0  (token ownership)
 *   - expiresAt > block.timestamp      (not expired)
 *
 * Returns null ONLY when contracts are not yet deployed (addresses absent).
 * Throws on RPC/contract errors so callers can fail explicitly rather than
 * silently granting access.
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
  const sig = await registry.getSignal(BigInt(onChainId)) as {
    signalHash:  string;
    agent:       string;
    expiration:  bigint;
    committedAt: bigint;
    stakeAmount: bigint;
    status:      bigint;
    accurate:    boolean;
    pnlBps:      bigint;
    rawPayload:  string;
  };

  return {
    signalHash:  sig.signalHash,
    agent:       sig.agent,
    expiration:  sig.expiration,
    committedAt: sig.committedAt,
    stakeAmount: sig.stakeAmount,
    status:      Number(sig.status) as OnChainSignal["status"],
    accurate:    sig.accurate,
    pnlBps:      sig.pnlBps,
    rawPayload:  sig.rawPayload,
  };
}

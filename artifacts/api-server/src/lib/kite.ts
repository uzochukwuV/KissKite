/**
 * kite.ts — Typed contract client helpers for the Kite Signal Platform.
 *
 * Exposes two factory functions that return typed ethers v6 Contract instances
 * connected to the Kite Testnet RPC. Import these in route handlers and
 * background workers — never construct raw Contract objects with ABI strings
 * elsewhere in application code.
 *
 * Usage:
 *   const registry = await getSignalRegistry();
 *   const onChainSignal = await registry.getSignal(onChainId);
 *
 *   const pass = await getSubscriptionPass();
 *   const { active, tier, expiresAt } = await pass.isActive(walletAddress);
 */

import { ethers } from "ethers";
import {
  SignalRegistryABI,
  SubscriptionPassABI,
  DEPLOYMENTS,
} from "@workspace/contracts";
import { logger } from "./logger";

const KITE_RPC = "https://rpc-testnet.gokite.ai";

// Lazy singleton provider — shared across all calls in this process
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

// Lazy singleton signer (deployer key) — used for keeper/settler operations
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

// ─── Signal Registry ──────────────────────────────────────────────────────────

/**
 * Returns a read-only Contract instance for SignalRegistry.
 * Use this for view calls (getSignal, getAgentSignalIds, etc.).
 */
export function getSignalRegistry(): ethers.Contract {
  const address = DEPLOYMENTS.signalRegistry;
  if (!address) {
    throw new Error(
      "SIGNAL_REGISTRY_ADDRESS is not set — deploy contracts first and add the address to Secrets"
    );
  }
  return new ethers.Contract(address, SignalRegistryABI, getProvider());
}

/**
 * Returns a signer-connected Contract instance for SignalRegistry.
 * Use this for write calls (settleSignal, markExpired, etc.) from the keeper.
 */
export function getSignalRegistryWriter(): ethers.Contract {
  const address = DEPLOYMENTS.signalRegistry;
  if (!address) {
    throw new Error(
      "SIGNAL_REGISTRY_ADDRESS is not set — deploy contracts first and add the address to Secrets"
    );
  }
  return new ethers.Contract(address, SignalRegistryABI, getSigner());
}

// ─── Subscription Pass ────────────────────────────────────────────────────────

/**
 * Returns a read-only Contract instance for SubscriptionPass.
 * Use this for isActive() checks during subscription verification.
 */
export function getSubscriptionPass(): ethers.Contract {
  const address = DEPLOYMENTS.subscriptionPass;
  if (!address) {
    throw new Error(
      "SUBSCRIPTION_PASS_ADDRESS is not set — deploy contracts first and add the address to Secrets"
    );
  }
  return new ethers.Contract(address, SubscriptionPassABI, getProvider());
}

// ─── On-chain helpers ─────────────────────────────────────────────────────────

/**
 * Check on-chain whether a wallet holds an active subscription pass.
 * Returns null if contracts are not yet deployed (address not set).
 */
export async function checkOnChainSubscription(walletAddress: string): Promise<{
  active:    boolean;
  tier:      number;
  expiresAt: bigint;
} | null> {
  try {
    const pass = getSubscriptionPass();
    const [active, tier, expiresAt] = await pass.isActive(walletAddress) as [boolean, bigint, bigint];
    return { active, tier: Number(tier), expiresAt };
  } catch (err) {
    // Contract not deployed yet — gracefully degrade to DB-only verification
    logger.warn({ err, walletAddress }, "On-chain subscription check failed — using DB fallback");
    return null;
  }
}

/**
 * Fetch a committed signal record from the chain by its on-chain ID.
 * Returns null if contracts are not yet deployed.
 */
export async function getOnChainSignal(onChainId: number): Promise<{
  signalHash:  string;
  agent:       string;
  expiration:  bigint;
  committedAt: bigint;
  stakeAmount: bigint;
  status:      number;
  accurate:    boolean;
  pnlBps:      bigint;
  rawPayload:  string;
} | null> {
  try {
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
    return { ...sig, status: Number(sig.status) };
  } catch (err) {
    logger.warn({ err, onChainId }, "On-chain signal fetch failed");
    return null;
  }
}

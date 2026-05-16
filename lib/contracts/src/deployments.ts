/**
 * Deployed contract addresses on Kite Testnet.
 *
 * Source of truth: lib/contracts/src/kite-testnet.json
 * The deploy script (contracts/scripts/deploy.ts) writes populated addresses to
 * BOTH contracts/deployments/kite-testnet.json AND lib/contracts/src/kite-testnet.json.
 *
 * Env vars override the JSON values at runtime, so you can point the backend at
 * a re-deployment without rebuilding the package:
 *   SIGNAL_REGISTRY_ADDRESS, SUBSCRIPTION_PASS_ADDRESS
 */

import recorded from "./kite-testnet.json" with { type: "json" };

export interface Deployments {
  network:          string;
  chainId:          number;
  signalRegistry:   string;
  subscriptionPass: string;
  usdtToken:        string;
}

export const DEPLOYMENTS: Deployments = {
  network:          recorded.network,
  chainId:          recorded.chainId,
  signalRegistry:   process.env.SIGNAL_REGISTRY_ADDRESS   || recorded.signalRegistry,
  subscriptionPass: process.env.SUBSCRIPTION_PASS_ADDRESS || recorded.subscriptionPass,
  usdtToken:        recorded.usdtToken,
};

/**
 * Deployed contract addresses on Kite Testnet.
 * Updated automatically by the deploy script (contracts/scripts/deploy.ts).
 * After deployment, copy addresses from contracts/deployments/kite-testnet.json
 * and set them as Replit Secrets:
 *   SIGNAL_REGISTRY_ADDRESS
 *   SUBSCRIPTION_PASS_ADDRESS
 */
export interface Deployments {
  network:          string;
  chainId:          number;
  signalRegistry:   string;
  subscriptionPass: string;
  clientAgentVault: string;
  usdtToken:        string;
}

// Addresses are read from environment variables set after deployment.
// Before deployment these will be empty strings — the backend checks
// for the addresses before making any on-chain calls.
export const DEPLOYMENTS: Deployments = {
  network:          "kite-testnet",
  chainId:          2368,
  signalRegistry:   process.env.SIGNAL_REGISTRY_ADDRESS   ?? "",
  subscriptionPass: process.env.SUBSCRIPTION_PASS_ADDRESS ?? "",
  clientAgentVault: process.env.CLIENT_AGENT_VAULT_ADDRESS ?? "",
  usdtToken:        "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63",
};

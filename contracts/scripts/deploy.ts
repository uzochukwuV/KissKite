import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

// Kite testnet USDT (18-decimal test stablecoin)
const TESTNET_USDT = "0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  // ── 1. Deploy SignalRegistry ──────────────────────────────────────────────

  console.log("Deploying SignalRegistry...");
  const minStakeWei = ethers.parseEther("0.001");

  const SignalRegistry = await ethers.getContractFactory("SignalRegistry");
  const signalRegistry = await SignalRegistry.deploy(
    deployer.address, // owner
    deployer.address, // settler (keeper — update after deployment)
    minStakeWei
  );
  await signalRegistry.waitForDeployment();
  const signalRegistryAddress = await signalRegistry.getAddress();
  console.log("SignalRegistry:   ", signalRegistryAddress);

  // ── 2. Deploy SubscriptionPass ────────────────────────────────────────────

  console.log("Deploying SubscriptionPass...");
  const SubscriptionPass = await ethers.getContractFactory("SubscriptionPass");
  const subscriptionPass = await SubscriptionPass.deploy(
    deployer.address, // owner
    TESTNET_USDT      // usdt payment token
  );
  await subscriptionPass.waitForDeployment();
  const subscriptionPassAddress = await subscriptionPass.getAddress();
  console.log("SubscriptionPass: ", subscriptionPassAddress);

  // ── 3. Deploy ClientAgentVault (example instance) ─────────────────────────

  console.log("Deploying ClientAgentVault (example instance)...");
  const ClientAgentVault = await ethers.getContractFactory("ClientAgentVault");
  const clientAgentVault = await ClientAgentVault.deploy(
    deployer.address,
    deployer.address,
    deployer.address
  );
  await clientAgentVault.waitForDeployment();
  const clientAgentVaultAddress = await clientAgentVault.getAddress();
  console.log("ClientAgentVault: ", clientAgentVaultAddress);

  // Configure vault spending rules
  const dailyBudget = ethers.parseEther("0.01");
  const now = BigInt(Math.floor(Date.now() / 1000));
  await clientAgentVault.configureSpendingRules(
    [86400n],
    [dailyBudget],
    [now],
    [[signalRegistryAddress]]
  );
  console.log("Vault spending rules configured");

  // ── 4. Write deployments JSON ─────────────────────────────────────────────

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deployments = {
    network:           "kite-testnet",
    chainId:           2368,
    deployedAt:        new Date().toISOString(),
    deployer:          deployer.address,
    signalRegistry:    signalRegistryAddress,
    subscriptionPass:  subscriptionPassAddress,
    clientAgentVault:  clientAgentVaultAddress,
    usdtToken:         TESTNET_USDT,
    config: {
      minStakeEth:    "0.001",
      vaultDailyBudgetEth: "0.01",
    },
  };

  const deploymentsPath = path.join(deploymentsDir, "kite-testnet.json");
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log("\nDeployment addresses written to:", deploymentsPath);

  // ── 5. Summary ────────────────────────────────────────────────────────────

  console.log("\n════════════════════════════════════════════════════════");
  console.log("DEPLOYMENT SUMMARY — Kite Testnet");
  console.log("════════════════════════════════════════════════════════");
  console.log("Deployer:         ", deployer.address);
  console.log("SignalRegistry:   ", signalRegistryAddress);
  console.log("SubscriptionPass: ", subscriptionPassAddress);
  console.log("ClientAgentVault: ", clientAgentVaultAddress);
  console.log("USDT Token:       ", TESTNET_USDT);
  console.log("════════════════════════════════════════════════════════");
  console.log("\nSet SIGNAL_REGISTRY_ADDRESS, SUBSCRIPTION_PASS_ADDRESS");
  console.log("in Replit Secrets after deployment.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

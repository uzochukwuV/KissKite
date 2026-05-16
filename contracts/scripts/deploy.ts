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
  const SignalRegistry = await ethers.getContractFactory("SignalRegistry");
  const signalRegistry = await SignalRegistry.deploy();
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

  // ── 3. Write deployments JSON ─────────────────────────────────────────────

  const deploymentsRecord = {
    network:          "kite-testnet",
    chainId:          2368,
    deployedAt:       new Date().toISOString(),
    deployer:         deployer.address,
    signalRegistry:   signalRegistryAddress,
    subscriptionPass: subscriptionPassAddress,
    usdtToken:        TESTNET_USDT,
  };

  const deploymentsJson = JSON.stringify(deploymentsRecord, null, 2);

  // Write to contracts/deployments/ (canonical deployment record)
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const deploymentsPath = path.join(deploymentsDir, "kite-testnet.json");
  fs.writeFileSync(deploymentsPath, deploymentsJson);
  console.log("\nDeployment record written to:    ", deploymentsPath);

  // Also write to lib/contracts/src/ so the TypeScript package exports live addresses
  const libContractsPath = path.join(
    __dirname, "..", "..", "lib", "contracts", "src", "kite-testnet.json"
  );
  if (fs.existsSync(path.dirname(libContractsPath))) {
    fs.writeFileSync(libContractsPath, deploymentsJson);
    console.log("TypeScript package updated at:   ", libContractsPath);
  }

  // ── 4. Summary ────────────────────────────────────────────────────────────

  console.log("\n════════════════════════════════════════════════════════");
  console.log("DEPLOYMENT SUMMARY — Kite Testnet");
  console.log("════════════════════════════════════════════════════════");
  console.log("Deployer:         ", deployer.address);
  console.log("SignalRegistry:   ", signalRegistryAddress);
  console.log("SubscriptionPass: ", subscriptionPassAddress);
  console.log("USDT Token:       ", TESTNET_USDT);
  console.log("════════════════════════════════════════════════════════");
  console.log("\nNext: set these in Replit Secrets:");
  console.log("  SIGNAL_REGISTRY_ADDRESS  =", signalRegistryAddress);
  console.log("  SUBSCRIPTION_PASS_ADDRESS=", subscriptionPassAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // ── 1. Deploy SignalRegistry ──────────────────────────────────────────────
  console.log("\nDeploying SignalRegistry...");

  // settler = deployer (can be updated after deployment to a keeper address)
  const minStakeWei = ethers.parseEther("0.001"); // 0.001 ETH minimum stake per signal

  const SignalRegistry = await ethers.getContractFactory("SignalRegistry");
  const signalRegistry = await SignalRegistry.deploy(
    deployer.address, // owner
    deployer.address, // settler (keeper)
    minStakeWei
  );
  await signalRegistry.waitForDeployment();
  const signalRegistryAddress = await signalRegistry.getAddress();
  console.log("SignalRegistry deployed to:", signalRegistryAddress);

  // ── 2. Deploy ClientAgentVault (example — one per agent in production) ───
  console.log("\nDeploying ClientAgentVault (example instance)...");

  const ClientAgentVault = await ethers.getContractFactory("ClientAgentVault");
  const clientAgentVault = await ClientAgentVault.deploy(
    deployer.address, // owner
    deployer.address, // agent (replace with actual agent AA wallet)
    deployer.address  // operator (replace with platform operator)
  );
  await clientAgentVault.waitForDeployment();
  const clientAgentVaultAddress = await clientAgentVault.getAddress();
  console.log("ClientAgentVault deployed to:", clientAgentVaultAddress);

  // ── 3. Configure spending rules on the vault ──────────────────────────────
  console.log("\nConfiguring spending rules...");

  const dailyBudget = ethers.parseEther("0.01"); // 0.01 ETH daily budget
  const now = BigInt(Math.floor(Date.now() / 1000));

  await clientAgentVault.configureSpendingRules(
    [86400n],                    // 24-hour window
    [dailyBudget],               // 0.01 ETH daily budget
    [now],                       // window starts now
    [[signalRegistryAddress]]    // only SignalRegistry is whitelisted
  );
  console.log("Spending rules configured: 0.01 ETH/day to SignalRegistry");

  // ── 4. Output deployment summary ─────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════");
  console.log("DEPLOYMENT SUMMARY");
  console.log("════════════════════════════════════════════════════════");
  console.log("Network:           Kite Testnet");
  console.log("Deployer:         ", deployer.address);
  console.log("SignalRegistry:   ", signalRegistryAddress);
  console.log("ClientAgentVault: ", clientAgentVaultAddress);
  console.log("Min Signal Stake:  0.001 ETH");
  console.log("Daily Budget:      0.01 ETH");
  console.log("════════════════════════════════════════════════════════");
  console.log("\nSave these addresses — update SIGNAL_REGISTRY_ADDRESS");
  console.log("and AGENT_VAULT_ADDRESS in your .env / Replit secrets.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

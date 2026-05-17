import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const SCORER_ADDRESS =
  process.env.SCORER_ADDRESS ||
  new ethers.Wallet(process.env.SCORER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || "").address;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:      ", deployer.address);
  console.log("Scorer wallet: ", SCORER_ADDRESS);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:       ", ethers.formatEther(balance), "ETH\n");

  if (balance === 0n) {
    throw new Error("Deployer wallet has zero balance — fund it first.");
  }

  console.log("Deploying ReputationRegistry...");
  const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
  const reputationRegistry = await ReputationRegistry.deploy(deployer.address, SCORER_ADDRESS);
  await reputationRegistry.waitForDeployment();
  const address = await reputationRegistry.getAddress();
  console.log("ReputationRegistry:", address);

  // Patch both JSON files
  const files = [
    path.join(__dirname, "..", "deployments", "kite-testnet.json"),
    path.join(__dirname, "..", "..", "lib", "contracts", "src", "kite-testnet.json"),
  ];

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;
    const record = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    record.reputationRegistry = address;
    record.deployedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
    console.log("Updated:", filePath);
  }

  console.log("\n════════════════════════════════════════════");
  console.log("Set this in Replit Secrets:");
  console.log("  REPUTATION_REGISTRY_ADDRESS =", address);
  console.log("════════════════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

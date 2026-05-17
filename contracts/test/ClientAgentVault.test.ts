import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("ClientAgentVault", function () {
  let vault: any;
  let owner: HardhatEthersSigner;
  let agent: HardhatEthersSigner;
  let operator: HardhatEthersSigner;
  let unauthorized: HardhatEthersSigner;
  let target: HardhatEthersSigner;
  let targetAddress: string;

  const TIME_WINDOW = 86400n; // 24 hours
  const BUDGET = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, agent, operator, unauthorized, target] = await ethers.getSigners();
    targetAddress = target.address;

    const VaultFactory = await ethers.getContractFactory("ClientAgentVault");
    vault = await VaultFactory.deploy(owner.address, agent.address, operator.address);
    await vault.waitForDeployment();

    // Fund the vault
    await owner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("10") });

    // Configure spending rules for the target
    const now = BigInt(await time.latest());
    await vault.connect(operator).configureSpendingRules(
      [TIME_WINDOW],
      [BUDGET],
      [now],
      [[targetAddress]]
    );
  });

  describe("execute authorization", function () {
    it("reverts with Unauthorized() when called by non-agent", async function () {
      await expect(
        vault.connect(unauthorized).execute(targetAddress, 0n, "0x")
      ).to.be.revertedWithCustomError(vault, "Unauthorized");
    });

    it("succeeds within budget and emits CallExecuted", async function () {
      const value = ethers.parseEther("0.1");
      await expect(
        vault.connect(agent).execute(targetAddress, value, "0x")
      )
        .to.emit(vault, "CallExecuted")
        .withArgs(targetAddress, value, "0x", "0x");
    });
  });

  describe("budget enforcement", function () {
    it("reverts with BudgetExceeded when value exceeds remaining window budget", async function () {
      const over = BUDGET + 1n;
      await expect(
        vault.connect(agent).execute(targetAddress, over, "0x")
      ).to.be.revertedWithCustomError(vault, "BudgetExceeded");
    });

    it("window resets correctly after timeWindow seconds", async function () {
      // Use up the full budget
      await vault.connect(agent).execute(targetAddress, BUDGET, "0x");

      // Budget should be exhausted
      await expect(
        vault.connect(agent).execute(targetAddress, 1n, "0x")
      ).to.be.revertedWithCustomError(vault, "BudgetExceeded");

      // Advance past the window
      await time.increase(Number(TIME_WINDOW) + 1);

      // Budget should be reset
      await expect(
        vault.connect(agent).execute(targetAddress, BUDGET, "0x")
      ).to.not.be.reverted;
    });

    it("zero-value calls bypass budget checks entirely", async function () {
      // Exhaust budget first
      await vault.connect(agent).execute(targetAddress, BUDGET, "0x");

      // Zero-value call should still succeed despite exhausted budget
      await expect(
        vault.connect(agent).execute(targetAddress, 0n, "0x")
      ).to.not.be.reverted;
    });
  });

  describe("executeBatch", function () {
    it("reverts entire batch atomically if any call fails", async function () {
      // Second call exceeds budget
      const calls = [
        { target: targetAddress, value: ethers.parseEther("0.5"), data: "0x" },
        { target: targetAddress, value: BUDGET, data: "0x" }, // will exceed remaining budget
      ];
      await expect(
        vault.connect(agent).executeBatch(calls)
      ).to.be.revertedWithCustomError(vault, "BudgetExceeded");
    });

    it("succeeds when all calls are within budget", async function () {
      const halfBudget = BUDGET / 2n;
      const calls = [
        { target: targetAddress, value: halfBudget, data: "0x" },
        { target: targetAddress, value: halfBudget, data: "0x" },
      ];
      await expect(
        vault.connect(agent).executeBatch(calls)
      ).to.emit(vault, "BatchExecuted");
    });
  });

  describe("whitelist enforcement", function () {
    it("TargetNotWhitelisted is thrown for a target not in any rule", async function () {
      const notWhitelisted = unauthorized.address;
      await expect(
        vault.connect(agent).execute(notWhitelisted, ethers.parseEther("0.1"), "0x")
      ).to.be.revertedWithCustomError(vault, "TargetNotWhitelisted");
    });
  });
});

import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("ClientAgentVault", function () {
  async function deployFixture() {
    const [owner, agent, operator, other] = await ethers.getSigners();
    const Target = await ethers.getContractFactory("MockTarget");
    const target = await Target.deploy();
    const failingTarget = await Target.deploy();
    await target.waitForDeployment();
    await failingTarget.waitForDeployment();
    const Vault = await ethers.getContractFactory("ClientAgentVault");
    const vault = await Vault.deploy(owner.address, agent.address, operator.address);
    await vault.waitForDeployment();
    await owner.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("10") });
    await vault.configureSpendingRules([100], [ethers.parseEther("1")], [await time.latest()], [[await target.getAddress()]]);
    return { vault, target, failingTarget, owner, agent, operator, other };
  }

  it("execute reverts with Unauthorized when called by non-agent", async function () {
    const { vault, target, other } = await deployFixture();
    await expect(vault.connect(other).execute(await target.getAddress(), 0, target.interface.encodeFunctionData("ping")))
      .to.be.revertedWithCustomError(vault, "Unauthorized");
  });

  it("execute succeeds within budget and emits CallExecuted", async function () {
    const { vault, target, agent } = await deployFixture();
    const data = target.interface.encodeFunctionData("ping");
    await expect(vault.connect(agent).execute(await target.getAddress(), ethers.parseEther("0.5"), data))
      .to.emit(vault, "CallExecuted");
  });

  it("execute reverts with BudgetExceeded when value exceeds remaining budget", async function () {
    const { vault, target, agent } = await deployFixture();
    await expect(vault.connect(agent).execute(await target.getAddress(), ethers.parseEther("2"), target.interface.encodeFunctionData("ping")))
      .to.be.revertedWithCustomError(vault, "BudgetExceeded");
  });

  it("window resets after timeWindow seconds", async function () {
    const { vault, target, agent } = await deployFixture();
    const data = target.interface.encodeFunctionData("ping");
    await vault.connect(agent).execute(await target.getAddress(), ethers.parseEther("1"), data);
    await time.increase(101);
    await expect(vault.connect(agent).execute(await target.getAddress(), ethers.parseEther("1"), data))
      .to.emit(vault, "CallExecuted");
  });

  it("executeBatch reverts the entire batch if any call fails", async function () {
    const { vault, target, agent } = await deployFixture();
    await target.setShouldFail(true);
    const data = target.interface.encodeFunctionData("ping");
    await expect(vault.connect(agent).executeBatch([{ target: await target.getAddress(), value: 0, data }]))
      .to.be.revertedWithCustomError(vault, "CallFailed");
  });

  it("throws TargetNotWhitelisted for a non-whitelisted value target", async function () {
    const { vault, failingTarget, agent } = await deployFixture();
    await expect(vault.connect(agent).execute(await failingTarget.getAddress(), 1, failingTarget.interface.encodeFunctionData("ping")))
      .to.be.revertedWithCustomError(vault, "TargetNotWhitelisted");
  });

  it("zero-value calls bypass budget checks", async function () {
    const { vault, failingTarget, agent } = await deployFixture();
    await expect(vault.connect(agent).execute(await failingTarget.getAddress(), 0, failingTarget.interface.encodeFunctionData("ping")))
      .to.emit(vault, "CallExecuted");
  });
});

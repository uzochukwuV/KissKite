import { expect } from "chai";
import { ethers } from "hardhat";

async function deployRegistry() {
  const [owner, scorer, other, agent] = await ethers.getSigners();
  const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
  const registry = await ReputationRegistry.deploy(owner.address, scorer.address);
  await registry.waitForDeployment();
  return { registry, owner, scorer, other, agent };
}

describe("ReputationRegistry", function () {
  it("reverts with Unauthorized when called by a non-scorer", async function () {
    const { registry, other, agent } = await deployRegistry();
    await expect(registry.connect(other).recordSettlement(agent.address, true, 100, 1))
      .to.be.revertedWithCustomError(registry, "Unauthorized");
  });

  it("increments counters after one accurate settlement and scores 10000", async function () {
    const { registry, scorer, agent } = await deployRegistry();
    await registry.connect(scorer).recordSettlement(agent.address, true, 250, 1);
    const reputation = await registry.getReputation(agent.address);
    expect(reputation.totalSignals).to.equal(1n);
    expect(reputation.settledSignals).to.equal(1n);
    expect(reputation.accurateSignals).to.equal(1n);
    expect(reputation.cumulativePnlBps).to.equal(250n);
    expect(reputation.reputationScore).to.equal(10000n);
  });

  it("scores 0 after one inaccurate signal", async function () {
    const { registry, scorer, agent } = await deployRegistry();
    await registry.connect(scorer).recordSettlement(agent.address, false, -125, 1);
    expect(await registry.getScore(agent.address)).to.equal(0n);
  });

  it("scores 5000 after one accurate and one inaccurate signal", async function () {
    const { registry, scorer, agent } = await deployRegistry();
    await registry.connect(scorer).recordSettlement(agent.address, true, 100, 1);
    await registry.connect(scorer).recordSettlement(agent.address, false, -50, 2);
    expect(await registry.getScore(agent.address)).to.equal(5000n);
  });

  it("reverts with SignalAlreadyRecorded on duplicate signalId", async function () {
    const { registry, scorer, agent } = await deployRegistry();
    await registry.connect(scorer).recordSettlement(agent.address, true, 100, 1);
    await expect(registry.connect(scorer).recordSettlement(agent.address, false, -100, 1))
      .to.be.revertedWithCustomError(registry, "SignalAlreadyRecorded")
      .withArgs(1);
  });

  it("returns zero-value reputation and score for a new address", async function () {
    const { registry, agent } = await deployRegistry();
    const reputation = await registry.getReputation(agent.address);
    expect(reputation.totalSignals).to.equal(0n);
    expect(reputation.settledSignals).to.equal(0n);
    expect(reputation.accurateSignals).to.equal(0n);
    expect(reputation.cumulativePnlBps).to.equal(0n);
    expect(reputation.reputationScore).to.equal(0n);
    expect(await registry.getScore(agent.address)).to.equal(0n);
  });

  it("emits ReputationUpdated on every settlement", async function () {
    const { registry, scorer, agent } = await deployRegistry();
    await expect(registry.connect(scorer).recordSettlement(agent.address, true, 100, 1))
      .to.emit(registry, "ReputationUpdated")
      .withArgs(agent.address, 10000, 1);
    await expect(registry.connect(scorer).recordSettlement(agent.address, false, -100, 2))
      .to.emit(registry, "ReputationUpdated")
      .withArgs(agent.address, 5000, 2);
  });

  it("allows owner to update scorer and rejects the old scorer", async function () {
    const { registry, scorer, other, agent } = await deployRegistry();
    await registry.setScorer(other.address);
    await registry.connect(other).recordSettlement(agent.address, true, 100, 1);
    await expect(registry.connect(scorer).recordSettlement(agent.address, true, 100, 2))
      .to.be.revertedWithCustomError(registry, "Unauthorized");
  });
});

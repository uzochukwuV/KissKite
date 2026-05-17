import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { ReputationRegistry } from "../typechain-types";

describe("ReputationRegistry", function () {
  let registry: ReputationRegistry;
  let deployer: HardhatEthersSigner;
  let scorer: HardhatEthersSigner;
  let other: HardhatEthersSigner;
  let agent: HardhatEthersSigner;

  beforeEach(async function () {
    [deployer, scorer, other, agent] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ReputationRegistry");
    registry = await Factory.deploy(deployer.address, scorer.address) as ReputationRegistry;
    await registry.waitForDeployment();
  });

  describe("recordSettlement authorization", function () {
    it("reverts with Unauthorized() when called by non-scorer", async function () {
      await expect(
        registry.connect(other).recordSettlement(agent.address, true, 500n, 0n)
      ).to.be.revertedWithCustomError(registry, "Unauthorized");
    });

    it("allows the designated scorer to call recordSettlement", async function () {
      await expect(
        registry.connect(scorer).recordSettlement(agent.address, true, 500n, 0n)
      ).to.not.be.reverted;
    });
  });

  describe("recordSettlement — accounting", function () {
    it("increments totalSignals, settledSignals, accurateSignals after one accurate settlement", async function () {
      await registry.connect(scorer).recordSettlement(agent.address, true, 500n, 0n);
      const rep = await registry.getReputation(agent.address);
      expect(rep.totalSignals).to.equal(1n);
      expect(rep.settledSignals).to.equal(1n);
      expect(rep.accurateSignals).to.equal(1n);
    });

    it("does not increment accurateSignals for an inaccurate settlement", async function () {
      await registry.connect(scorer).recordSettlement(agent.address, false, -200n, 0n);
      const rep = await registry.getReputation(agent.address);
      expect(rep.accurateSignals).to.equal(0n);
    });
  });

  describe("reputationScore", function () {
    it("equals 10000 after one accurate signal", async function () {
      await registry.connect(scorer).recordSettlement(agent.address, true, 100n, 0n);
      const rep = await registry.getReputation(agent.address);
      expect(rep.reputationScore).to.equal(10000n);
    });

    it("equals 0 after one inaccurate signal", async function () {
      await registry.connect(scorer).recordSettlement(agent.address, false, -100n, 0n);
      const rep = await registry.getReputation(agent.address);
      expect(rep.reputationScore).to.equal(0n);
    });

    it("equals 5000 after one accurate and one inaccurate signal", async function () {
      await registry.connect(scorer).recordSettlement(agent.address, true, 100n, 0n);
      await registry.connect(scorer).recordSettlement(agent.address, false, -100n, 1n);
      const rep = await registry.getReputation(agent.address);
      expect(rep.reputationScore).to.equal(5000n);
    });
  });

  describe("duplicate signal guard", function () {
    it("reverts with SignalAlreadyRecorded on duplicate signalId", async function () {
      await registry.connect(scorer).recordSettlement(agent.address, true, 100n, 42n);
      await expect(
        registry.connect(scorer).recordSettlement(agent.address, true, 100n, 42n)
      ).to.be.revertedWithCustomError(registry, "SignalAlreadyRecorded");
    });
  });

  describe("getReputation / getScore views", function () {
    it("returns zero-value struct for address with no history", async function () {
      const rep = await registry.getReputation(other.address);
      expect(rep.totalSignals).to.equal(0n);
      expect(rep.settledSignals).to.equal(0n);
      expect(rep.accurateSignals).to.equal(0n);
      expect(rep.reputationScore).to.equal(0n);
    });

    it("getScore returns 0 before any settlements", async function () {
      expect(await registry.getScore(agent.address)).to.equal(0n);
    });

    it("getScore returns correct bps after settlements", async function () {
      await registry.connect(scorer).recordSettlement(agent.address, true, 100n, 0n);
      await registry.connect(scorer).recordSettlement(agent.address, true, 100n, 1n);
      await registry.connect(scorer).recordSettlement(agent.address, false, -100n, 2n);
      expect(await registry.getScore(agent.address)).to.equal(6666n);
    });
  });

  describe("ReputationUpdated event", function () {
    it("emits ReputationUpdated with correct args on every recordSettlement", async function () {
      await expect(
        registry.connect(scorer).recordSettlement(agent.address, true, 500n, 0n)
      )
        .to.emit(registry, "ReputationUpdated")
        .withArgs(agent.address, 10000n, 1n);

      await expect(
        registry.connect(scorer).recordSettlement(agent.address, false, -200n, 1n)
      )
        .to.emit(registry, "ReputationUpdated")
        .withArgs(agent.address, 5000n, 2n);
    });
  });

  describe("scorer update", function () {
    it("owner can update scorer address", async function () {
      await registry.connect(deployer).setScorer(other.address);
      expect(await registry.scorer()).to.equal(other.address);
    });

    it("new scorer can write after update", async function () {
      await registry.connect(deployer).setScorer(other.address);
      await expect(
        registry.connect(other).recordSettlement(agent.address, true, 100n, 0n)
      ).to.not.be.reverted;
    });

    it("old scorer is rejected after update", async function () {
      await registry.connect(deployer).setScorer(other.address);
      await expect(
        registry.connect(scorer).recordSettlement(agent.address, true, 100n, 0n)
      ).to.be.revertedWithCustomError(registry, "Unauthorized");
    });
  });
});

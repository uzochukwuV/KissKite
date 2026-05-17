import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

async function deployRegistry() {
  const [agent, other] = await ethers.getSigners();
  const SignalRegistry = await ethers.getContractFactory("SignalRegistry");
  const registry = await SignalRegistry.deploy();
  await registry.waitForDeployment();
  return { registry, agent, other };
}

function commitHash(rawPayload: string, salt: string): string {
  return ethers.solidityPackedKeccak256(["string", "string"], [rawPayload, salt]);
}

describe("SignalRegistry", function () {
  it("reverts with InvalidHash on bytes32(0)", async function () {
    const { registry } = await deployRegistry();
    await expect(registry.commitSignal(ethers.ZeroHash, (await time.latest()) + 100))
      .to.be.revertedWithCustomError(registry, "InvalidHash");
  });

  it("reverts with ExpirationInPast when expiration <= block.timestamp", async function () {
    const { registry } = await deployRegistry();
    await expect(registry.commitSignal(ethers.id("x"), await time.latest()))
      .to.be.revertedWithCustomError(registry, "ExpirationInPast");
  });

  it("reverts with HashAlreadyCommitted on duplicate hash", async function () {
    const { registry } = await deployRegistry();
    const hash = ethers.id("x");
    await registry.commitSignal(hash, (await time.latest()) + 100);
    await expect(registry.commitSignal(hash, (await time.latest()) + 200))
      .to.be.revertedWithCustomError(registry, "HashAlreadyCommitted")
      .withArgs(hash);
  });

  it("returns incrementing signal IDs starting at 0", async function () {
    const { registry, agent } = await deployRegistry();
    const expiration = (await time.latest()) + 100;
    await expect(registry.commitSignal(ethers.id("a"), expiration)).to.emit(registry, "SignalCommitted").withArgs(0, agent.address, ethers.id("a"), expiration);
    await expect(registry.commitSignal(ethers.id("b"), expiration)).to.emit(registry, "SignalCommitted").withArgs(1, agent.address, ethers.id("b"), expiration);
  });

  it("getSignal returns correct fields after commit", async function () {
    const { registry, agent } = await deployRegistry();
    const expiration = (await time.latest()) + 100;
    const hash = ethers.id("a");
    await registry.commitSignal(hash, expiration);
    const signal = await registry.getSignal(0);
    expect(signal.hash).to.equal(hash);
    expect(signal.agent).to.equal(agent.address);
    expect(signal.expiration).to.equal(BigInt(expiration));
    expect(signal.revealed).to.equal(false);
  });

  it("revealSignal reverts with NotSignalAgent when called by wrong address", async function () {
    const { registry, other } = await deployRegistry();
    const rawPayload = "payload";
    const salt = "salt";
    await registry.commitSignal(commitHash(rawPayload, salt), (await time.latest()) + 100);
    await expect(registry.connect(other).revealSignal(0, rawPayload, salt))
      .to.be.revertedWithCustomError(registry, "NotSignalAgent");
  });

  it("revealSignal reverts with HashMismatch on wrong payload/salt", async function () {
    const { registry } = await deployRegistry();
    await registry.commitSignal(commitHash("payload", "salt"), (await time.latest()) + 100);
    await expect(registry.revealSignal(0, "wrong", "salt"))
      .to.be.revertedWithCustomError(registry, "HashMismatch");
  });

  it("revealSignal reverts with SignalExpired after expiration", async function () {
    const { registry } = await deployRegistry();
    await registry.commitSignal(commitHash("payload", "salt"), (await time.latest()) + 2);
    await time.increase(3);
    await expect(registry.revealSignal(0, "payload", "salt"))
      .to.be.revertedWithCustomError(registry, "SignalExpired");
  });

  it("revealSignal succeeds and sets revealed", async function () {
    const { registry, agent } = await deployRegistry();
    await registry.commitSignal(commitHash("payload", "salt"), (await time.latest()) + 100);
    await expect(registry.revealSignal(0, "payload", "salt"))
      .to.emit(registry, "SignalRevealed")
      .withArgs(0, agent.address, "payload");
    const signal = await registry.getSignal(0);
    expect(signal.revealed).to.equal(true);
  });

  it("getAgentSignalIds returns all signal IDs for an agent", async function () {
    const { registry, agent } = await deployRegistry();
    const expiration = (await time.latest()) + 100;
    await registry.commitSignal(ethers.id("a"), expiration);
    await registry.commitSignal(ethers.id("b"), expiration);
    expect(await registry.getAgentSignalIds(agent.address)).to.deep.equal([0n, 1n]);
  });
});

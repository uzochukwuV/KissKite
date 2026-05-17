import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { SignalRegistry } from "../typechain-types";

describe("SignalRegistry", function () {
  let registry: SignalRegistry;
  let agent: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  const futureExpiry = async (offsetSeconds = 3600): Promise<bigint> => {
    const ts = await time.latest();
    return BigInt(ts + offsetSeconds);
  };

  const makeHash = (payload: string, salt: string): string =>
    ethers.keccak256(ethers.solidityPacked(["string", "string"], [payload, salt]));

  beforeEach(async function () {
    [agent, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SignalRegistry");
    registry = await Factory.deploy() as SignalRegistry;
    await registry.waitForDeployment();
  });

  describe("commitSignal validation", function () {
    it("reverts with InvalidHash() on bytes32(0)", async function () {
      const expiry = await futureExpiry();
      await expect(
        registry.connect(agent).commitSignal(ethers.ZeroHash, expiry)
      ).to.be.revertedWithCustomError(registry, "InvalidHash");
    });

    it("reverts with ExpirationInPast when expiration <= block.timestamp", async function () {
      const past = BigInt(await time.latest()) - 1n;
      const hash = makeHash("BTC_LONG_50000", "salt1");
      await expect(
        registry.connect(agent).commitSignal(hash, past)
      ).to.be.revertedWithCustomError(registry, "ExpirationInPast");
    });

    it("reverts with HashAlreadyCommitted on duplicate hash", async function () {
      const expiry = await futureExpiry();
      const hash = makeHash("BTC_LONG_50000", "salt1");
      await registry.connect(agent).commitSignal(hash, expiry);
      await expect(
        registry.connect(agent).commitSignal(hash, expiry)
      ).to.be.revertedWithCustomError(registry, "HashAlreadyCommitted");
    });

    it("returns incrementing signalIds starting at 0", async function () {
      const expiry = await futureExpiry();
      const tx1 = await registry.connect(agent).commitSignal(makeHash("payload1", "s1"), expiry);
      const tx2 = await registry.connect(agent).commitSignal(makeHash("payload2", "s2"), expiry);
      const r1 = await tx1.wait();
      const r2 = await tx2.wait();

      const iface = registry.interface;
      const event1 = r1?.logs.map((l) => { try { return iface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "SignalCommitted");
      const event2 = r2?.logs.map((l) => { try { return iface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "SignalCommitted");

      expect(event1?.args[0]).to.equal(0n);
      expect(event2?.args[0]).to.equal(1n);
    });
  });

  describe("getSignal", function () {
    it("returns correct fields after commit", async function () {
      const expiry = await futureExpiry();
      const hash = makeHash("ETH_BUY_3000", "mysalt");
      await registry.connect(agent).commitSignal(hash, expiry);
      const [h, a, , exp, revealed] = await registry.getSignal(0n);
      expect(h).to.equal(hash);
      expect(a).to.equal(agent.address);
      expect(exp).to.equal(expiry);
      expect(revealed).to.be.false;
    });
  });

  describe("revealSignal validation", function () {
    let signalId: bigint;
    const PAYLOAD = "ETH_BUY_3000";
    const SALT = "randomsalt";

    beforeEach(async function () {
      const expiry = await futureExpiry(3600);
      const hash = makeHash(PAYLOAD, SALT);
      const tx = await registry.connect(agent).commitSignal(hash, expiry);
      const receipt = await tx.wait();
      const iface = registry.interface;
      const event = receipt?.logs
        .map((l) => { try { return iface.parseLog(l); } catch { return null; } })
        .find((e) => e?.name === "SignalCommitted");
      signalId = event?.args[0] as bigint;
    });

    it("reverts with NotSignalAgent when called by wrong address", async function () {
      await expect(
        registry.connect(other).revealSignal(signalId, PAYLOAD, SALT)
      ).to.be.revertedWithCustomError(registry, "NotSignalAgent");
    });

    it("reverts with HashMismatch on wrong payload/salt combo", async function () {
      await expect(
        registry.connect(agent).revealSignal(signalId, "WRONG_PAYLOAD", SALT)
      ).to.be.revertedWithCustomError(registry, "HashMismatch");
    });

    it("reverts with SignalExpired after expiration timestamp", async function () {
      const expiry = await futureExpiry(60);
      const hash = makeHash("SOL_SELL_100", "saltsol");
      await registry.connect(agent).commitSignal(hash, expiry);
      await time.increase(120);
      await expect(
        registry.connect(agent).revealSignal(1n, "SOL_SELL_100", "saltsol")
      ).to.be.revertedWithCustomError(registry, "SignalExpired");
    });

    it("succeeds and sets revealed = true with correct payload", async function () {
      await registry.connect(agent).revealSignal(signalId, PAYLOAD, SALT);
      const [, , , , revealed] = await registry.getSignal(signalId);
      expect(revealed).to.be.true;
    });

    it("emits SignalRevealed with correct args", async function () {
      await expect(
        registry.connect(agent).revealSignal(signalId, PAYLOAD, SALT)
      )
        .to.emit(registry, "SignalRevealed")
        .withArgs(signalId, agent.address, PAYLOAD);
    });
  });

  describe("getAgentSignalIds", function () {
    it("returns all signal IDs for a given agent", async function () {
      const expiry = await futureExpiry();
      await registry.connect(agent).commitSignal(makeHash("p1", "s1"), expiry);
      await registry.connect(agent).commitSignal(makeHash("p2", "s2"), expiry);
      await registry.connect(other).commitSignal(makeHash("p3", "s3"), expiry);

      const agentIds = await registry.getAgentSignalIds(agent.address);
      expect(agentIds.length).to.equal(2);
      expect(agentIds).to.include(0n);
      expect(agentIds).to.include(1n);

      const otherIds = await registry.getAgentSignalIds(other.address);
      expect(otherIds.length).to.equal(1);
    });
  });
});

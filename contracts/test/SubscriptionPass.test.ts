import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("SubscriptionPass", function () {
  let pass: any;
  let mockUsdt: any;
  let owner: HardhatEthersSigner;
  let subscriber: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  const PRICE_BASIC = ethers.parseEther("1");

  beforeEach(async function () {
    [owner, subscriber, other] = await ethers.getSigners();

    // Deploy mock ERC-20 as USDT
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUsdt = await MockERC20.deploy("Mock USDT", "USDT", 18);
    await mockUsdt.waitForDeployment();

    // Mint test USDT to subscribers
    await mockUsdt.mint(subscriber.address, ethers.parseEther("100"));
    await mockUsdt.mint(other.address, ethers.parseEther("100"));

    // Deploy SubscriptionPass
    const PassFactory = await ethers.getContractFactory("SubscriptionPass");
    pass = await PassFactory.deploy(owner.address, await mockUsdt.getAddress());
    await pass.waitForDeployment();

    // Approve SubscriptionPass to spend USDT
    await mockUsdt.connect(subscriber).approve(await pass.getAddress(), ethers.parseEther("100"));
    await mockUsdt.connect(other).approve(await pass.getAddress(), ethers.parseEther("100"));
  });

  describe("purchase tier 1", function () {
    it("mints tier 1 token and sets expiry to ~7 days", async function () {
      const before = BigInt(await time.latest());
      await pass.connect(subscriber).purchase(1);
      const { active, tier, expiresAt } = await pass.isActive(subscriber.address);
      expect(active).to.be.true;
      expect(tier).to.equal(1);
      const sevenDays = 7n * 24n * 3600n;
      expect(expiresAt).to.be.gte(before + sevenDays - 5n);
      expect(expiresAt).to.be.lte(before + sevenDays + 5n);
    });

    it("isActive returns true immediately after purchase", async function () {
      await pass.connect(subscriber).purchase(1);
      const { active } = await pass.isActive(subscriber.address);
      expect(active).to.be.true;
    });

    it("isActive returns false after warping time past expiry", async function () {
      await pass.connect(subscriber).purchase(1);
      await time.increase(7 * 24 * 3600 + 1);
      const { active } = await pass.isActive(subscriber.address);
      expect(active).to.be.false;
    });

    it("purchasing while active extends from current expiry not from now", async function () {
      await pass.connect(subscriber).purchase(1);
      const { expiresAt: firstExpiry } = await pass.isActive(subscriber.address);

      // Advance half-way through
      await time.increase(3 * 24 * 3600);
      await mockUsdt.connect(subscriber).approve(await pass.getAddress(), ethers.parseEther("100"));
      await pass.connect(subscriber).purchase(1);

      const { expiresAt: secondExpiry } = await pass.isActive(subscriber.address);
      const sevenDays = 7n * 24n * 3600n;
      const diff = secondExpiry > firstExpiry + sevenDays
        ? secondExpiry - firstExpiry - sevenDays
        : firstExpiry + sevenDays - secondExpiry;
      expect(diff).to.be.lte(10n);
    });
  });

  describe("soulbound enforcement", function () {
    it("safeTransferFrom between two non-zero addresses reverts with TransferNotAllowed", async function () {
      await pass.connect(subscriber).purchase(1);
      await expect(
        pass.connect(subscriber).safeTransferFrom(subscriber.address, other.address, 1, 1, "0x")
      ).to.be.revertedWithCustomError(pass, "TransferNotAllowed");
    });
  });

  describe("withdrawRevenue", function () {
    it("transfers full USDT balance to owner", async function () {
      await pass.connect(subscriber).purchase(1);
      const passAddress = await pass.getAddress();
      const balanceBefore = await mockUsdt.balanceOf(owner.address);
      const passBalance = await mockUsdt.balanceOf(passAddress);

      await pass.connect(owner).withdrawRevenue(owner.address);

      const balanceAfter = await mockUsdt.balanceOf(owner.address);
      expect(balanceAfter - balanceBefore).to.equal(passBalance);
      expect(await mockUsdt.balanceOf(passAddress)).to.equal(0n);
    });
  });
});

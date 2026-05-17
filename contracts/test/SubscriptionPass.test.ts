import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("SubscriptionPass", function () {
  async function deployFixture() {
    const [owner, subscriber, other] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdt = await MockERC20.deploy();
    await usdt.waitForDeployment();
    const SubscriptionPass = await ethers.getContractFactory("SubscriptionPass");
    const pass = await SubscriptionPass.deploy(owner.address, await usdt.getAddress());
    await pass.waitForDeployment();
    await usdt.mint(subscriber.address, ethers.parseEther("100"));
    await usdt.connect(subscriber).approve(await pass.getAddress(), ethers.MaxUint256);
    return { pass, usdt, owner, subscriber, other };
  }

  it("purchase(1) mints tier 1 token and sets expiry to about now + 7 days", async function () {
    const { pass, subscriber } = await deployFixture();
    await pass.connect(subscriber).purchase(1);
    expect(await pass.balanceOf(subscriber.address, 1)).to.equal(1n);
    const [, tier, expiresAt] = await pass.isActive(subscriber.address);
    expect(tier).to.equal(1n);
    expect(expiresAt).to.be.closeTo(BigInt((await time.latest()) + 7 * 24 * 60 * 60), 2n);
  });

  it("isActive returns true immediately and false after expiry", async function () {
    const { pass, subscriber } = await deployFixture();
    await pass.connect(subscriber).purchase(1);
    expect((await pass.isActive(subscriber.address)).active).to.equal(true);
    await time.increase(7 * 24 * 60 * 60 + 1);
    expect((await pass.isActive(subscriber.address)).active).to.equal(false);
  });

  it("purchasing while active extends from current expiry", async function () {
    const { pass, subscriber } = await deployFixture();
    await pass.connect(subscriber).purchase(1);
    const first = await pass.isActive(subscriber.address);
    await time.increase(60);
    await pass.connect(subscriber).purchase(1);
    const second = await pass.isActive(subscriber.address);
    expect(second.expiresAt).to.equal(first.expiresAt + BigInt(7 * 24 * 60 * 60));
  });

  it("blocks soulbound transfers", async function () {
    const { pass, subscriber, other } = await deployFixture();
    await pass.connect(subscriber).purchase(1);
    await expect(pass.connect(subscriber).safeTransferFrom(subscriber.address, other.address, 1, 1, "0x"))
      .to.be.revertedWithCustomError(pass, "TransferNotAllowed");
  });

  it("withdrawRevenue transfers full USDT balance to owner", async function () {
    const { pass, usdt, owner, subscriber } = await deployFixture();
    await pass.connect(subscriber).purchase(1);
    await pass.withdrawRevenue(owner.address);
    expect(await usdt.balanceOf(await pass.getAddress())).to.equal(0n);
    expect(await usdt.balanceOf(owner.address)).to.equal(ethers.parseEther("1"));
  });
});

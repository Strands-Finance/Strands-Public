const { ethers } = require("hardhat");
import { expect } from "chai";
import { seedEmptyRepositoryFixture } from "../../scripts/utils/fixture";
import { hre } from "../../scripts/utils/testSetup";
import { toBN, fromBN } from "../../scripts/utils/web3utils";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  currentTime,
  fastForward,
  restoreSnapshot,
  takeSnapshot,
} from "../../scripts/utils/evm";
import { parseUnits } from "ethers";

describe("Repository Deposit - Testing (using SimpleBookKeeper)", function () {
  before(async () => {
    await seedEmptyRepositoryFixture({
      deployNew: true,
      useSimpleBookKeeper: true
    });
  });

  describe("testing StrandsAPI", function () {
    it("non controller can NOT mint", async function () {
      const amount = ethers.parseUnits("10000", 6);
      await expect(hre.f.SC.strandsAPI.connect(hre.f.alice).mint(
        await hre.f.alice.getAddress(), amount)).to.be.
        revertedWithCustomError(hre.f.SC.strandsAPI, "OnlyController");
    });

    it("only controller can mint", async function () {
      const amount = ethers.parseUnits("10000", 6);
      await hre.f.SC.strandsAPI.connect(hre.f.SC.repositoryContracts[0].controller).mint(
        await hre.f.alice.getAddress(), amount);

      expect(await hre.f.SC.strandsAPI.balanceOf(await hre.f.alice.getAddress())).to.be.eq(amount)
    });

    it("non controller can NOT burn", async function () {
      const amount = ethers.parseUnits("10000", 6);
      expect(await hre.f.SC.strandsAPI.balanceOf(await hre.f.alice.getAddress())).to.be.eq(amount)
      await expect(hre.f.SC.strandsAPI.connect(hre.f.alice).
        burn(amount)).to.be.revertedWithCustomError(hre.f.SC.strandsAPI, "OnlyController");
    });

    it("only controller can burn", async function () {
      const amount = ethers.parseUnits("10000", 6);
      await hre.f.SC.strandsAPI.connect(hre.f.SC.repositoryContracts[0].controller).mint(
        hre.f.SC.repositoryContracts[0].controller.getAddress(), amount);
      expect(await hre.f.SC.strandsAPI.balanceOf(hre.f.SC.repositoryContracts[0].controller.getAddress())).to.be.eq(amount)
      await hre.f.SC.strandsAPI.connect(hre.f.SC.repositoryContracts[0].controller).burn(amount);
      expect(await hre.f.SC.strandsAPI.balanceOf(await hre.f.deployer.getAddress())).to.be.eq(0)
    });

    it("non owner can NOT ownerBurn", async function () {
      const amount = ethers.parseUnits("10000", 6);
      expect(await hre.f.SC.strandsAPI.balanceOf(await hre.f.alice.getAddress())).to.be.eq(amount)
      await expect(hre.f.SC.strandsAPI.connect(hre.f.alice).
        ownerBurn(await hre.f.alice.getAddress(), amount)).to.be.
        revertedWithCustomError(hre.f.SC.strandsAPI, "OnlyOwner");
    });

    it("only owner can ownerBurn", async function () {
      const amount = ethers.parseUnits("10000", 6);
      expect(await hre.f.SC.strandsAPI.balanceOf(await hre.f.alice.getAddress())).to.be.eq(amount)
      await hre.f.SC.strandsAPI.connect(hre.f.deployer).ownerBurn(await hre.f.alice.getAddress(), amount);
      expect(await hre.f.SC.strandsAPI.balanceOf(await hre.f.alice.getAddress())).to.be.eq(0)
    });
  });

  describe("testing SFP", function () {
    it("should deposit and mint repository tokens to alice", async function () {
      await hre.f.SC.strandsAPI.connect(hre.f.SC.repositoryContracts[0].controller).mint(
        await hre.f.alice.getAddress(), ethers.parseUnits("10000", 6));

      // initiate deposit
      let amount = "1000"
      // // approve the repository to manage usdc on your behalf
      await hre.f.SC.strandsAPI.connect(hre.f.alice).approve(
        await hre.f.SC.repositoryContracts[0].repository.getAddress(),
        ethers.parseUnits(amount, 6)
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(ethers.parseUnits(amount, 6), toBN("1"));

      // process deposit
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.eq(toBN(amount));

      expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.eq(toBN("1"));

      expect(
        await hre.f.SC.repositoryContracts[0].repository.getAUM()
      ).to.be.eq(toBN(amount));
    });

    it("correctly calculate NAV after transfer", async () => {
      let amount = "1000"
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.eq(toBN(amount));

      expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.eq(toBN("1"));

      await hre.f.SC.strandsAPI.connect(hre.f.SC.repositoryContracts[0].controller).mint(
        await hre.f.SC.repositoryContracts[0].repository.getAddress(), ethers.parseUnits("250", 6));

      await expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.eq(toBN("1.25"));
    });

    it("should be able to withdraw", async () => {
      let amount = "500"
      const minOut = toBN("1", 6); // 1 token of depositAsset

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.eq(toBN("1000"));

      expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.eq(toBN("1.25"));

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).
        setLicensingFeeRate(0)

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateWithdraw(toBN(amount), minOut);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.alice).redeemClaimable();

      //1000+250-500/1.25=625
      expect(await hre.f.SC.repositoryContracts[0].repository.getAUM()
      ).to.be.eq(toBN("625"));

      expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.eq(toBN("1.25"));

      //1000-500=500
      expect(await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
        await hre.f.alice.getAddress())).to.be.eq(toBN(amount));

      //10000-1000+500/1.25=9625
      expect(
        await hre.f.SC.strandsAPI.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.eq(ethers.parseUnits("9625", 6));
    });

  });

  describe("deposit cap", () => {
    it(`intiate deposit should fail if capReached`, async () => {
      const amount = ethers.parseUnits("10000", 18);
      await hre.f.SC.strandsAPI.connect(hre.f.SC.repositoryContracts[0].controller).mint(
        await hre.f.alice.getAddress(), amount);
      await hre.f.SC.strandsAPI.connect(
        hre.f.alice
      ).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );
      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).setTotalValueCap18(toBN("1000"))

      await hre.f.SC.repositoryContracts[0].repository
      .connect(await hre.f.alice)
      .initiateDeposit(toBN("300",6),0);
      await expect(hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice).initiateDeposit(toBN("500",6),0)).to.be.
        revertedWithCustomError(hre.f.SC.repositoryContracts[0].repository, "TotalValueCapReached");
    });
  });
});


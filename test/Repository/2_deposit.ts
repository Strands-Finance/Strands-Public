import { MaxUint256 } from "ethers";
import { fastForward } from "../../scripts/utils/evm";
import { seedFixture, seedEmptyRepositoryFixture } from "../../scripts/utils/fixture";
import { approveAndDepositUSDC } from "../../scripts/seedTestSystem";
import { hre } from "../../scripts/utils/testSetup";
import { toBN, fromBN } from "../../scripts/utils/web3utils";

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Repository Deposit - Testing (using DirectInputBookKeeper)", function () {

  beforeEach(async () => {
    await seedEmptyRepositoryFixture({
      deployNew: true,
      useDirectInputBookKeeper: true,
      useWalletExecutor: true,
    });
  });

  describe("depositing to contract", function () {
    it("should revert if amount is zero", async function () {
      await expect(
        hre.f.SC.repositoryContracts[0].repository.initiateDeposit(0, 0)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "InvalidAmount"
      );
    });

    it("should transfer mockUSDC from msg.sender to the contract", async function () {
      const amount = ethers.parseUnits("10000", 6);

      const preBalance = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].repository.getAddress()
      );

      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.equal(amount + preBalance);
    });

    it("should mint repository tokens to the msg.sender", async function () {
      const amount = 100;

      await approveAndDepositUSDC(hre.f.alice, toBN(amount, 6));

      const tokenValue =
        await hre.f.SC.repositoryContracts[0].repository.getNAV();
      expect(tokenValue).eq(toBN("1"));

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      const estimateValue = toBN(amount / fromBN(tokenValue));

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          hre.f.alice.address
        )
      ).to.be.closeTo(estimateValue, toBN("1"));
    });

    it("correctly calculate the amount of tokens that the user should receive", async function () {
      const amount = 100;

      await approveAndDepositUSDC(hre.f.alice, toBN(amount, 6));

      const nav = await hre.f.SC.repositoryContracts[0].repository.getNAV();
      const estimateValue = toBN(amount / fromBN(nav));

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.closeTo(estimateValue, toBN("1"));
    });

    it("Double value of the pool and see that the correct number of tokens are minted", async function () {
      const amount = 1000
      await approveAndDepositUSDC(hre.f.alice, toBN(amount, 6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).equal(toBN(amount, 6));

      await approveAndDepositUSDC(hre.f.alice, toBN(amount, 6));

      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).equal(toBN(amount * 2, 6));

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);
    });
  });

  describe("Permission testing for queue processing", function () {
    it("should revert if processDeposit is not called by the controller", async function () {
      const amount = 100;
      await approveAndDepositUSDC(hre.f.alice, toBN(amount, 6));

      await expect(
        hre.f.SC.repositoryContracts[0].repository.processDeposits(1)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyController"
      );
    });

    it("should succeed if processDeposit is called by the controller", async function () {
      const contractBalancePre = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].repository.getAddress()
      );
      const amount = 100;
      await approveAndDepositUSDC(hre.f.alice, toBN(amount, 6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      const licenseFee = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].feeRecipient.address
      );
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.equal(contractBalancePre + toBN(amount, 6) - licenseFee);
    });
  });

  describe("Checking repository tokens on processing", async function () {
    it("should revert if repository tokens are not minted", async function () {
      const amount = ethers.parseUnits("100", 6);
      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );
      const lpTokensBefore =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        );
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);

      await fastForward(60);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      const lpTokensAfter =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        );
      expect(lpTokensAfter).to.be.gt(lpTokensBefore);
    });
  });

  describe("checking IDs and the storage order", async () => {
    it("should initiate deposits with sequential IDs", async () => {
      const amount1 = ethers.parseUnits("100", 6);
      const amount2 = ethers.parseUnits("200", 6);
      const amount3 = ethers.parseUnits("300", 6);

      let initialQueueIndex = parseInt(
        (
          await hre.f.SC.repositoryContracts[0].repository.depositHead()
        ).toString()
      );
      let initialAmount = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].repository.getAddress()
      );
      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount1
      );
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount1, toBN("1"));

      // increment initial amount
      initialAmount += amount1;
      initialQueueIndex += 1;

      expect(
        await hre.f.SC.repositoryContracts[0].repository.depositHead()
      ).to.equal(initialQueueIndex);
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.equal(initialAmount);

      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount2
      );
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount2, toBN("1"));

      // increment initial amount
      initialAmount += amount2;
      initialQueueIndex += 1;

      expect(
        await hre.f.SC.repositoryContracts[0].repository.depositHead()
      ).to.equal(initialQueueIndex);
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.equal(initialAmount);

      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount3
      );
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount3, toBN("1"));

      // increment initial amount
      initialAmount += amount3;
      initialQueueIndex += 1;

      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.equal(initialAmount);
      expect(
        await hre.f.SC.repositoryContracts[0].repository.depositHead()
      ).to.equal(initialQueueIndex);
    });
  });

  describe("Checking that deposits are refunded when not enough LP tokens are given in return", async () => {
    it('should refund the user if the LP tokens are less than mint limit', async () => {

      const amount = ethers.parseUnits("100", 6);
      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );

      const numLpTokens = await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
        await hre.f.alice.getAddress()
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, MaxUint256);

      var preBalance = await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress());

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).processDeposits(1)

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.alice).redeemClaimable();

      var postBalance = await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress());

      expect(postBalance).to.be.eq(preBalance + amount);
    });

    it("checking that if the expected amount of  tokens are minted the deposit is not refunded", async () => {

      const amount = 1000;
      await approveAndDepositUSDC(hre.f.alice, toBN(amount, 6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);


      const totalSUpply = await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply();
      expect(totalSUpply).to.be.eq(toBN(amount));

      await approveAndDepositUSDC(hre.f.alice, toBN(amount, 6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      const totalSUpplyAfter = await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply();

      expect(totalSUpplyAfter).to.be.approximately(toBN(2 * amount), toBN("1"));

    });
  });
});

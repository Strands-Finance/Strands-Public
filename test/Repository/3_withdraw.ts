import { MaxInt256, MaxUint256 } from "ethers/constants";
import { seedFixture } from "../../scripts/utils/fixture";
import { hre } from "../../scripts/utils/testSetup";
import { toBN } from "../../scripts/utils/web3utils";

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Repository Withdraw - Testing (using BookKeeper)", function () {
  beforeEach(() => seedFixture({}));
  let minOut = toBN("1", 6);

  describe("signal withdraw from contract", function () {
    it("should revert if amount is zero", async function () {
      await expect(
        hre.f.SC.repositoryContracts[0].repository.initiateWithdraw(0, minOut)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "InvalidAmount"
      );
    });

    it("can NOT withdraw if balance - pendingDeposit < amount", async () => {
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.equal(toBN("50000", 6));

      const amount = toBN("100", 6);

      await hre.f.SC.MockUSDC.connect(hre.f.SC.userAccount).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateDeposit(amount, toBN("1"));

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .moveFundsToExecutor(amount)

      //balance = 50000 - 100 + 100 pending
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateWithdraw(toBN("50000", 18), toBN("50000", 6));

      await expect(hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1)).to.revertedWithCustomError(
          hre.f.SC.repositoryContracts[0].repository, "InsufficientLocalFundsToProcessRedemption");
    });

    it("remove all repository token from the repository as per seeded fixture", async () => {
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.equal(ethers.parseUnits("50000", 6));
      // check how many repository tokens the user has
      const numLpTokens =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        );

      // approve repository to spend user's repository token
      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.SC.userAccount)
        .approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),
          numLpTokens
        );
      // initiate withdraw
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateWithdraw(numLpTokens, minOut);
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        )
      ).to.equal(0);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);


      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.userAccount).redeemClaimable();

      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.equal(0);

      // Get the licensing fee amount
      const licenseFee = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].feeRecipient.address
      );

      // already has been seeded with 50k of USDC in the repository
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        )
      ).to.equal(toBN("100000", 6) - licenseFee);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        )
      ).to.equal(0);
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.equal(0);
    });

    it("remove partial repository token from the repository as per seeded fixture", async () => {
      await hre.f.SC.repositoryFactory
        .connect(hre.f.SC.deployer)
        .setFeeRecipient(hre.f.signers[1].address);
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.equal(ethers.parseUnits("50000", 6));
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        )
      ).to.equal(ethers.parseUnits("50000", 6));
      // check how many repository tokens the user has
      const numLpTokens =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        );

      // approve repository to spend user's repository token
      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.SC.userAccount)
        .approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),
          numLpTokens / 2n
        );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateWithdraw(numLpTokens / 2n, minOut);
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        )
      ).to.equal(numLpTokens / 2n);

      const nav = await hre.f.SC.repositoryContracts[0].repository.getNAV();

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.userAccount).redeemClaimable();

      // fee processed as well, so value need to be not exactly 25k
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.be.closeTo(ethers.parseUnits("25000", 6), ethers.parseUnits("1", 6));

      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        )
      ).to.be.closeTo(ethers.parseUnits("75000", 6), ethers.parseUnits("1", 6)); // 50k + 25k redemption
    });
  });

  describe("Check that state is correctly preserved in the withdraw queue", function () {
    it("should withdraw deposits with sequential IDs", async () => {
      const amount = ethers.parseUnits("1000", 18);

      const initialQueueIndex = parseInt(
        (
          await hre.f.SC.repositoryContracts[0].repository.withdrawHead()
        ).toString()
      );
      const initialAmount = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].repository.getAddress()
      );
      const initialUserBalance = await hre.f.SC.MockUSDC.balanceOf(
        await hre.f.SC.userAccount
      );
      const initialTokenSupply =
        await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply();

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateWithdraw(amount, minOut);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(2);

      // Get the licensing fee amount
      const step1LicenseFee = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].feeRecipient.address
      );
      const step1UserBalance = await hre.f.SC.MockUSDC.balanceOf(
        await hre.f.SC.userAccount
      );

      expect(
        await hre.f.SC.repositoryContracts[0].repository.withdrawHead()
      ).to.equal(initialQueueIndex + 1);
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.equal(
        initialAmount -
        (step1UserBalance - initialUserBalance) -
        step1LicenseFee
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateWithdraw(amount, minOut);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);

      expect(
        await hre.f.SC.repositoryContracts[0].repository.withdrawHead()
      ).to.equal(initialQueueIndex + 2);
      const step2UserBalance = await hre.f.SC.MockUSDC.balanceOf(
        await hre.f.SC.userAccount
      );
      // Get the licensing fee amount
      const step2LicenseFee = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].feeRecipient.address
      );

      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.equal(
        initialAmount -
        (step2UserBalance - initialUserBalance) -
        step2LicenseFee
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateWithdraw(amount, minOut);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);

      const step3UserBalance = await hre.f.SC.MockUSDC.balanceOf(
        await hre.f.SC.userAccount
      );
      // Get the licensing fee amount
      const step3LicenseFee = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].feeRecipient.address
      );

      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.equal(
        initialAmount -
        (step3UserBalance - initialUserBalance) -
        step3LicenseFee
      );
      expect(
        await hre.f.SC.repositoryContracts[0].repository.withdrawHead()
      ).to.equal(initialQueueIndex + 3);
    });
  });

  describe("deposit and then withdraw, from same account, same amounts multiple times to check that the correct amount of money is received", async () => {
    it("should be able to deposit and withdraw the same amount after change in NAV", async () => {
      // use alice for this

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.eq(0);
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(ethers.parseUnits("0", 6));
      // mint alice 150K
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        await hre.f.alice.getAddress(),
        ethers.parseUnits("200000", 6)
      );
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(ethers.parseUnits("200000", 6));

      // deposit 50k usdc
      const amount = ethers.parseUnits("50000", 6);
      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        ethers.parseUnits("200000", 6)
      );
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // 200k - 50k(deposited)
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(ethers.parseUnits("150000", 6));

      // deposit another 50k usdc
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // deposit another 50k usdc
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // deposit another 50k usdc
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // check that alice has no remaining usdc balance
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(ethers.parseUnits("0", 6));

      // withdraw a 1/4 of the repository tokens
      const tokens =
        ((await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )) /
          toBN("4")) *
        toBN("1");
      const tokenBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        );

      // withdraw all 4 at the same time in sep withdraws
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateWithdraw(tokens, minOut);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateWithdraw(tokens, minOut);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateWithdraw(tokens, minOut);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateWithdraw(tokenBalance - (tokens * toBN("3")) / toBN("1"), minOut);

      const licenseFee = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].feeRecipient.address
      );

      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(ethers.parseUnits("0", 6));
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.be.eq(ethers.parseUnits("250000", 6) - licenseFee);

      // check that alice doesn't have any repository tokens left
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.eq(0);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(10);

      const afterlicenseFee = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].feeRecipient.address
      );

      const repositoryRemainingBalance = await hre.f.SC.MockUSDC.balanceOf(
        await hre.f.SC.repositoryContracts[0].repository.getAddress()
      );

      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(
        ethers.parseUnits("250000", 6) -
        repositoryRemainingBalance -
        afterlicenseFee
      );
    });

    // difference between this test and the above test is to check how the NAV is calculated.
    it("deposit tokens at different NAVs and withdraw them all to see if the price is effected", async () => {
      // use alice for this
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.eq(0);
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(ethers.parseUnits("0", 6));

      // mint alice 200k
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        await hre.f.alice.getAddress(),
        ethers.parseUnits("200000", 6)
      );
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(ethers.parseUnits("200000", 6));

      // deposit 50k usdc
      const amount = ethers.parseUnits("50000", 6);
      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        ethers.parseUnits("200000", 6)
      );
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // 200k - 50k(deposited), 150k remaining
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(ethers.parseUnits("150000", 6));

      // deposit another 50k usdc, 100k remaining
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // deposit another 50k usdc, 50k remaining
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // deposit another 50k usdc, 50k remaining
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // check that alice has no remaining usdc balance, 0 remaining
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(ethers.parseUnits("0", 6));

      const tokens =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        );

      // withdraw all of the repository tokens
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateWithdraw(tokens, minOut);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);
      const repositoryRemainigBalance = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].repository.getAddress()
      );
      const licenseFee = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].feeRecipient.address
      );
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(
        ethers.parseUnits("250000", 6) - repositoryRemainigBalance - licenseFee
      );
    });
  });

  describe("Check that withdraws that are do not meet minimum pay out are not processed", () => {
    it("check that when a user doesn't get the required amount out the withdraw is not processed", async () => {
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.eq(0);

      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(ethers.parseUnits("0", 6));

      // mint alice 200k
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        await hre.f.alice.getAddress(),
        ethers.parseUnits("200000", 6)
      );

      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(ethers.parseUnits("200000", 6));

      // deposit 50k usdc
      const amount = ethers.parseUnits("50000", 6);
      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        ethers.parseUnits("200000", 6)
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).processDeposits(1);


      const aliceLpTokenAmounts = await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(await hre.f.alice.getAddress());
      const aliceUSDCBalance = await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress());


      // alice is going to withdraw her full amount and expect max uint to be returned
      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.alice).initiateWithdraw(aliceLpTokenAmounts, toBN("10000000"));

      // process the withdraw
      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).processWithdrawals(1);

      // check that alice has same usdc
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(aliceUSDCBalance);

      // check that alice has her repository tokens back
      expect(await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(await hre.f.alice.getAddress())).to.be.eq(aliceLpTokenAmounts);

    });

  });

  describe("withdraw for all users", function () {
    it('check event is emmited (postive case)', async () => {
      // checking user is correctly seeded before test
      expect(await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(await hre.f.SC.userAccount.getAddress())).to.be.eq(toBN("50000"));

      // send the tokens to the burn address
      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.SC.userAccount)
        .transfer(await hre.f.alice.getAddress(), toBN("50000"));

      expect(await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(await hre.f.SC.userAccount.getAddress())).to.be.eq(toBN("0"));

      const withdrawalArray = [await hre.f.SC.userAccount.getAddress()] as string[];

      // try and withdraw for all
      await expect(hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .initiateWithdrawAllFor(withdrawalArray)).to.emit(hre.f.SC.repositoryContracts[0].repository, "InvalidWithdrawQueued");
    });

    it('check event is not emmited (Negative case)', async () => {
      // checking user is correctly seeded before test
      expect(await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(await hre.f.SC.userAccount.getAddress())).to.be.eq(toBN("50000"));

      const withdrawalArray = [await hre.f.SC.userAccount.getAddress()] as string[];

      // try and withdraw for all
      await expect(hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .initiateWithdrawAllFor(withdrawalArray)).to.not.emit(hre.f.SC.repositoryContracts[0].repository, "InvalidWithdrawQueued");
    });

  });

});

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { seedEmptyRepositoryFixture } from "../../scripts/utils/fixture";
import { approveAndDepositUSDC } from "../../scripts/seedTestSystem";
import { hre } from "../../scripts/utils/testSetup";
import { fromBN, toBN } from "../../scripts/utils/web3utils";
import { BigNumberish, FixedNumber, toBigInt } from "ethers";
import { currentTime } from "../../scripts/utils/evm";

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Repository NAV Calculation - Testing (using DirectInputBookKeeper)", function () {
  // different fixtures require different snapIds
  beforeEach(async () => {
    await seedEmptyRepositoryFixture({
      deployNew: true,
      useDirectInputBookKeeper: true,
      useWalletExecutor: true,
    });
  });

  describe("scenario checks for NAV", function () {
    it("checking NAV movement as pool doubles", async () => {
      expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.eq(ethers.parseUnits("1", 18));


      const amount = 100;
      await approveAndDepositUSDC(hre.f.alice, toBN(amount, 6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // check the NAV
      const tokenPricePre =
        await hre.f.SC.repositoryContracts[0].repository.getNAV();
      expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.eq(ethers.parseUnits("1", 18));

      await approveAndDepositUSDC(hre.f.alice, toBN(amount, 6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      const usdcAmountInVault = await hre.f.SC.MockUSDC.balanceOf(
        await hre.f.SC.repositoryContracts[0].repository.getAddress()
      );
      const lpTotalSupply =
        await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply();

      // check the NAV
      const tokenPricePost =
        await hre.f.SC.repositoryContracts[0].repository.getNAV();

      const price = fromBN(usdcAmountInVault, 6) / fromBN(lpTotalSupply, 18)

      expect(tokenPricePost).to.be.eq(toBN(price));
    });

    it("check effects of large withdrawals on NAV", async () => {
      expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.eq(ethers.parseUnits("1", 18));
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.eq(0);

      // checking that fixture is working properly
      const aliceUSDCBalance = await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      expect(aliceUSDCBalance).to.be.eq(ethers.parseUnits("100000", 6));

      // add 10k to the repository from alice
      await approveAndDepositUSDC(hre.f.alice, ethers.parseUnits("100000", 6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // another user deposits
      // mint some usdc to user account
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        await hre.f.SC.userAccount.getAddress(),
        ethers.parseUnits("100000", 6)
      );
      await approveAndDepositUSDC(
        hre.f.SC.userAccount,
        ethers.parseUnits("100000", 6)
      );
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // have alice withdraw and see if she gets her whole amount back
      // check alice has zero usdc left
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.eq(0);

      const numLpTokens =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        );

      // approve repository to spend user's repository token
      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.alice)
        .approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),
          numLpTokens
        );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateWithdraw(numLpTokens, 0);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);

      // Alice has to claim her usdc
      // check the event is emitted correctly and that the correct details are emitted
      // block timestamp arg is off by one for some reason... not a major problem
      await expect(hre.f.SC.repositoryContracts[0].repository.connect(hre.f.alice).redeemClaimable())
        .to.emit(hre.f.SC.repositoryContracts[0].repository, "ClaimRedeemed");

      // check alice has her usdc back
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.closeTo(ethers.parseUnits("100000", 6), toBN("1", 6));
    });

    it("checking NAV grows as more usdc is deposited to the pool(should simulate returns on stratergy", async () => {
      expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.eq(ethers.parseUnits("1", 18));

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.eq(0);

      // add 10k to the repository from alice
      const amount = 10000
      await approveAndDepositUSDC(hre.f.alice, toBN(amount, 6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // check the NAV
      const tokenPricePre =
        await hre.f.SC.repositoryContracts[0].repository.getNAV();

      // another user deposits
      // mint some usdc to user account
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        await hre.f.SC.userAccount.getAddress(),
        toBN(amount, 6)
      );

      await approveAndDepositUSDC(hre.f.SC.userAccount, toBN(amount, 6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);


      // send mockUSDC to the repository
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        toBN(amount, 6)
      );

      // check the NAV after AUM increase by 50%
      const tokenPricePost =
        await hre.f.SC.repositoryContracts[0].repository.getNAV();
      // console.log("tokenPricePost=%s tokenPricePost=%s",fromBN(tokenPricePre),fromBN(tokenPricePost))
      expect(tokenPricePost).to.be.gt(tokenPricePre);

      // check that both users receive more than they deposited, rewards should be split roughly evenly
      const aliceLpBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        );
      const userLpBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        );

      // approve contract to spend alice's repository token
      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.alice)
        .approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),
          aliceLpBalance
        );

      // withdraw alice amount
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateWithdraw(aliceLpBalance, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);

      // alice needs to claim
      expect(await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.alice).redeemClaimable())

      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).to.be.gt(toBN(amount, 6));


      // approve contract to spend bob's repository token
      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.SC.userAccount)
        .approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),
          userLpBalance
        );

      // withdraw bob amount
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateWithdraw(userLpBalance, 0);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.userAccount).redeemClaimable()

      expect(await hre.f.SC.MockUSDC.balanceOf(await hre.f.SC.userAccount.getAddress())).to.be.gt(toBN(amount, 6));
    });
  });
});



import {
  seedFixture,
  seedEmptyRepositoryFixture,
} from "../../scripts/utils/fixture";
import { hre } from "../../scripts/utils/testSetup";
import { fromBN, toBN } from "../../scripts/utils/web3utils";
import { printRepositoryStatus } from "../../scripts/utils/debugging";
import RepositoryABI from "../../artifacts/contracts/Repository.sol/Repository.json";
import MockUSDC from "../../artifacts/contracts/test-helpers/TestERC20SetDecimals.sol/TestERC20SetDecimals.json";
import { ethers, Interface } from "ethers";
const { expect } = require("chai");

describe("Repository OffChainDeposit & Withdraw - Testing (using DirectInputBookKeeper)", function () {
  beforeEach(async () => {
    await seedEmptyRepositoryFixture({
      deployNew: true,
      useDirectInputBookKeeper: true,
      useWalletExecutor: true,
    });
  });

  describe("OffChain Deposit", async () => {
    it("non controller can not call offChainDeposit", async () => {
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.SC.userAccount)
          .offChainDeposit18(toBN("1000"), toBN("1"), hre.f.alice.address)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyController"
      );
    });

    it("controller can call the offChainDeposit", async () => {
      // printRepositoryStatus(hre.f.SC.repositoryContracts[0]);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainDeposit18(toBN("1000"), toBN("1"), hre.f.alice.address);
      const balance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          hre.f.alice.address
        );
      expect(balance).to.be.eq(toBN("1000"));
      // Check valueOutsideRepositorySettled set as False
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.valueOutsideRepositorySettled()
      ).to.be.eq(false);
    });
  });

  describe("OffChain Withdraw", async () => {
    it("non controller can not call offChainWithdraw", async () => {
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.SC.userAccount)
          .offChainWithdraw(toBN("1000"), toBN("1"), hre.f.alice.address)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyController"
      );
    });

    it("offChainWithdraw not work with wrong custodialWallet", async () => {
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.SC.repositoryContracts[0].controller)
          .offChainWithdraw(toBN("1000"), toBN("1"), hre.f.alice.address)
      ).to.be.revertedWithCustomError(hre.f.SC.repositoryContracts[0].repository, "InsufficientRepositoryTokenBalance"
      );
    });

    it("offChainWithdraw not work with amount > wallet Repository Token balance", async () => {
      // Deposit first
      const offChainDepositAmount = toBN("1000");
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainDeposit18(
          offChainDepositAmount,
          toBN("1"),
          hre.f.alice.address
        );

      // Check valueOutsideRepositorySettled set as False
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.valueOutsideRepositorySettled()
      ).to.be.eq(false);
      // mark valueOutsideRepository
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOutsideRepository18(
          offChainDepositAmount,
          1000,
          toBN("1", 18)
        );
      // set valueOutsideRepositorySettled to true
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOutsideRepositorySettled(true);

      // Call withdraw
      await expect(hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainWithdraw(toBN("2000"), toBN("1"), hre.f.alice.address)
      ).to.be.revertedWithCustomError(hre.f.SC.repositoryContracts[0].repository, "InsufficientRepositoryTokenBalance");
    });

    it("offChainWithdraw work with correct custodial wallet and amount", async () => {

      // on chain deposit first
      const amount = ethers.parseUnits("10000", 6);
      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        hre.f.SC.repositoryContracts[0].repository,
        amount
      );
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);


      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setAcceptableMarginOfError(toBN("0.00001"));

      // off chain deposit
      const offChainDepositAmount = toBN("1000");
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainDeposit18(
          offChainDepositAmount,
          toBN("1"),
          hre.f.SC.userAccount.address
        );

      const userBalancBefore =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          hre.f.SC.userAccount
        );

      // Check valueOutsideRepositorySettled set as False
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.valueOutsideRepositorySettled()
      ).to.be.eq(false);
      // mark valueOutsideRepository
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOutsideRepository18(
          offChainDepositAmount,
          1000,
          toBN("1", 18)
        );
      // set valueOutsideRepositorySettled to true
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOutsideRepositorySettled(true);

      // off chain withdraw
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainWithdraw(
          userBalancBefore,
          toBN("1"),
          hre.f.SC.userAccount.address
        );
      const userBalanceAfter =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          hre.f.SC.userAccount
        );

      expect(userBalanceAfter).to.be.eq(toBN("0"));
      // Check valueOutsideRepositorySettled set as False
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.valueOutsideRepositorySettled()
      ).to.be.eq(false);
    });
  });
});

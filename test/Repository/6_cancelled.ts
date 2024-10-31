import { seedFixture } from "../../scripts/utils/fixture";
import { hre } from "../../scripts/utils/testSetup";
import { fromBN, toBN } from "../../scripts/utils/web3utils";
import chalk from "chalk";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {seedWithUSDC} from "../../scripts/seedTestSystem";

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Repository Cancelled - Testing (using BookKeeper)", function () {
  beforeEach(() => seedFixture({}));

  describe("scenario checks for cancelled - deposit", function () {
    it("check that an order can be cancelled second in the queue", async () => {
      await createDeposit("10000");
      const headId =
        await hre.f.SC.repositoryContracts[0].repository.depositHead();
      // headId points at the next free slot so the first deposit is at headId - 1

      // 1 is processed in the seedFixture meaning that the headId is 2
      expect(headId).to.be.eq(2);

      // check that the order is in the queue
      const queuedDeposit =
        await hre.f.SC.repositoryContracts[0].repository.depositQueue(1);


      expect(queuedDeposit[1]).to.be.eq(
        await hre.f.SC.userAccount.getAddress()
      );

      expect(queuedDeposit[2]).to.be.eq(ethers.parseUnits("10000", 6));

      // cancel the order
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .removeDepositFromQueue(1);

      // get again and see if isCancelled is true
      const nextQueuedDepositPost =
        await hre.f.SC.repositoryContracts[0].repository.depositQueue(1);
      expect(nextQueuedDepositPost.isCancelled).to.be.true;
    });

    it("create a deposit, create another(cancel), create another(deposit) - make sure that they can be processed", async () => {
      const userTokenBalanceBefore =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        );
      await createDeposit("10000");
      const headId =
        await hre.f.SC.repositoryContracts[0].repository.depositHead();
      // headId points at the next free slot so the first deposit is at headId - 1
      expect(headId).to.be.eq(2);
      // check that the order is in the queue
      const queuedDeposit =
        await hre.f.SC.repositoryContracts[0].repository.depositQueue(1);
      expect(queuedDeposit[1]).to.be.eq(
        await hre.f.SC.userAccount.getAddress()
      );
      expect(queuedDeposit[2]).to.be.eq(ethers.parseUnits("10000", 6));

      // create another deposit
      await createDeposit("20000");
      // check that the order is in the queue
      const queuedDeposit2 =
        await hre.f.SC.repositoryContracts[0].repository.depositQueue(2);
      expect(queuedDeposit2[1]).to.be.eq(
        await hre.f.SC.userAccount.getAddress()
      );
      expect(queuedDeposit2[2]).to.be.eq(ethers.parseUnits("20000", 6));

      // cancel the second order
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .removeDepositFromQueue(2);

      // get again and see if isCancelled is true
      const queuedDeposit2Post =
        await hre.f.SC.repositoryContracts[0].repository.depositQueue(2);
      expect(queuedDeposit2Post.isCancelled).to.be.true;

      // create another deposit
      await createDeposit("30000");

      // check that the order is in the queue
      const nextQueuedDeposit3 =
        await hre.f.SC.repositoryContracts[0].repository.depositQueue(3);
      expect(nextQueuedDeposit3[1]).to.be.eq(
        await hre.f.SC.userAccount.getAddress()
      );
      expect(nextQueuedDeposit3[2]).to.be.eq(ethers.parseUnits("30000", 6));

      // process them all
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(10);

      // check pending deposits is zero
      expect(
        await hre.f.SC.repositoryContracts[0].repository.totalQueuedDeposits()
      ).to.be.eq(0);
      const userTokenBalanceAfter =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        );
    });
  });

  describe("scenario checks for cancelled - withdraw", function () {
    it("check that an order can be cancelled in the queue", async () => {
      await createDepositAndProcess(hre.f.SC.userAccount, "10000");
      // approve repository to spend user's Lp token
      const userLpBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        );
      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.SC.userAccount)
        .approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),
          userLpBalance
        );
      // withdraw 10k
      await hre.f.SC.repositoryContracts[0].repository
        .connect(await hre.f.SC.userAccount)
        .initiateWithdraw(userLpBalance, 0);
      // check that the order is in the queue
      const nextQueuedWithdraw =
        await hre.f.SC.repositoryContracts[0].repository.withdrawQueue(0);
      expect(nextQueuedWithdraw[1]).to.be.eq(
        await hre.f.SC.userAccount.getAddress()
      );
      // check that total pending withdraws is not 0
      expect(
        await hre.f.SC.repositoryContracts[0].repository.totalQueuedWithdrawals()
      ).to.not.be.eq(0);
      // cancel withdraw
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .removeWithdrawalFromQueue(0);
      const queuedWithdrawal =
        await hre.f.SC.repositoryContracts[0].repository.withdrawQueue(0);
      expect(queuedWithdrawal[1]).to.be.eq(
        await hre.f.SC.userAccount.getAddress()
      );
      expect(queuedWithdrawal[2]).to.be.eq(0);
      expect(
        await hre.f.SC.repositoryContracts[0].repository.totalQueuedWithdrawals()
      ).to.be.eq(0);
    });

    it("check an order can be cancelled and the queue can be processed", async () => {
      await createDepositAndProcess(hre.f.SC.userAccount, "10000");
      const numOfLpTokens =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        );
      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.SC.userAccount)
        .approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),
          numOfLpTokens
        );
      // check usdc balance of the repository
      const usdcBalanceOfRepository = await hre.f.SC.MockUSDC.balanceOf(
        await hre.f.SC.repositoryContracts[0].repository.getAddress()
      );
      // withdraw 10k
      const userTokenBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        );
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateWithdraw(userTokenBalance, 0);
      // check that the order is in the queue
      const nextQueuedWithdraw =
        await hre.f.SC.repositoryContracts[0].repository.withdrawQueue(0);
      expect(nextQueuedWithdraw[1]).to.be.eq(
        await hre.f.SC.userAccount.getAddress()
      );
      // check that total pending withdraws is not 0
      expect(
        await hre.f.SC.repositoryContracts[0].repository.totalQueuedWithdrawals()
      ).to.not.be.eq(0);
      // cancel withdraw
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .removeWithdrawalFromQueue(0);
      // check that pending withdraws is 0
      expect(
        await hre.f.SC.repositoryContracts[0].repository.totalQueuedWithdrawals()
      ).to.be.eq(0);
      // process the queue
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(10);
      // check that total pending withdraws is 0
      expect(
        await hre.f.SC.repositoryContracts[0].repository.totalQueuedWithdrawals()
      ).to.be.eq(0);
      // check that the withdraw was marked as cancelled
      const nextQueuedWithdrawPost =
        await hre.f.SC.repositoryContracts[0].repository.withdrawQueue(0);
      expect(nextQueuedWithdrawPost.isCancelled).to.be.true;

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        )
      ).to.be.eq(numOfLpTokens);

      // repository balance changed due to processing license fee
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.be.closeTo(usdcBalanceOfRepository, toBN("1", 6));
    });

    it("alice, bob initiate withdraw. cancel alice's withdraw. bob withdrawal will be processed", async () => {
      await seedWithUSDC(hre.f.alice);
      await createDepositAndProcess(hre.f.alice, "10000");
      await createDepositAndProcess(hre.f.SC.userAccount, "10000");
      const aliceLpBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        );
      const bobLpBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(await hre.f.alice)
        .initiateWithdraw(aliceLpBalance, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(await hre.f.SC.userAccount)
        .initiateWithdraw(bobLpBalance, 0);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .removeWithdrawalFromQueue(0);

      // alice will get Repository Token back after cancel withdraw
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.eq(aliceLpBalance);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        )
      ).to.be.eq(0);
    });
    it("alice, bob initiate withdraw. cancel bob's withdraw. alice withdrawal will be processed", async () => {
      await seedWithUSDC(hre.f.alice);
      await createDepositAndProcess(hre.f.alice, "10000");
      await createDepositAndProcess(hre.f.SC.userAccount, "10000");
      const aliceLpBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        );
      const bobLpBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(await hre.f.alice)
        .initiateWithdraw(aliceLpBalance, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(await hre.f.SC.userAccount)
        .initiateWithdraw(bobLpBalance, 0);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .removeWithdrawalFromQueue(1);

      // bob will get Repository Token back after cancel withdraw
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.SC.userAccount.getAddress()
        )
      ).to.be.eq(bobLpBalance);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.eq(0);
    });
  });
});

async function createDeposit(_amount: string): Promise<void> {
  const amount = ethers.parseUnits(_amount, 6);

  if (amount < await hre.f.SC.MockUSDC.balanceOf(hre.f.SC.userAccount.address)) {
    // mint some more mockUSDC
    await hre.f.SC.MockUSDC.connect(hre.f.SC.repositoryContracts[0].owner).mint(
      hre.f.SC.userAccount.address,
      amount
    );
  }

  await hre.f.SC.MockUSDC.connect(hre.f.SC.userAccount).approve(
    hre.f.SC.repositoryContracts[0].repository.getAddress(),
    amount
  );

  await hre.f.SC.repositoryContracts[0].repository
    .connect(hre.f.SC.userAccount)
    .initiateDeposit(amount, 0);


  // console.log(chalk.yellow("Deposit initiated"));
}

async function createDepositAndProcess(
  user: SignerWithAddress,
  _amount: string
): Promise<void> {
  const amount = ethers.parseUnits(_amount, 6);

  await hre.f.SC.MockUSDC.connect(user).approve(
    hre.f.SC.repositoryContracts[0].repository.getAddress(),
    amount
  );

  await hre.f.SC.repositoryContracts[0].repository
    .connect(user)
    .initiateDeposit(amount, 0);
  // console.log(chalk.yellow("Deposit initiated"));
  await hre.f.SC.repositoryContracts[0].repository
    .connect(hre.f.SC.repositoryContracts[0].controller)
    .processDeposits(10);
  // console.log(chalk.yellow("Deposit processed"));
}


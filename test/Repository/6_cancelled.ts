import { hre, expect, ethers, loadFixture, createFixture, getAlice, getBob, approveAndDeposit, approveAndWithdraw } from "../helpers/setupTestSystem.js";
import { fromBN, toBN } from "../helpers/testUtils.js";
import chalk from "chalk";

describe(`Repository Cancelled - Testing (using accountNFTBookKeeper)`, function () {
  let alice: any;
  let bob: any;

  const deployContractsFixture = createFixture(
    'accountNFT',
    'none',
    'USDC',
    true,
    100000,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);

    alice = getAlice();
    bob = getBob();
  });


  describe("scenario checks for cancelled - deposit", function () {
    it("check that an order can be cancelled second in the queue", async () => {
      await approveAndDeposit(bob, toBN("10000", 6));
      const headId =
        await hre.f.SC.repositoryContracts[0].repository.depositHead();
      // headId points at the next free slot so the first deposit is at headId - 1

      // 1 is processed in the seedFixture meaning that the headId is 2
      expect(headId).to.be.eq(2);

      // check that the order is in the queue
      const queuedDeposit =
        await hre.f.SC.repositoryContracts[0].repository.depositQueue(1);


      expect(queuedDeposit[1]).to.be.eq(
        await bob.getAddress()
      );

      expect(queuedDeposit[2]).to.be.eq(toBN("10000", 6));

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
          await bob.getAddress()
        );
      await approveAndDeposit(bob, toBN("10000", 6));
      const headId =
        await hre.f.SC.repositoryContracts[0].repository.depositHead();
      // headId points at the next free slot so the first deposit is at headId - 1
      expect(headId).to.be.eq(2);
      // check that the order is in the queue
      const queuedDeposit =
        await hre.f.SC.repositoryContracts[0].repository.depositQueue(1);
      expect(queuedDeposit[1]).to.be.eq(
        await bob.getAddress()
      );
      expect(queuedDeposit[2]).to.be.eq(toBN("10000", 6));

      // create another deposit
      await approveAndDeposit(bob, toBN("20000", 6));
      // check that the order is in the queue
      const queuedDeposit2 =
        await hre.f.SC.repositoryContracts[0].repository.depositQueue(2);
      expect(queuedDeposit2[1]).to.be.eq(
        await bob.getAddress()
      );
      expect(queuedDeposit2[2]).to.be.eq(toBN("20000", 6));

      // cancel the second order
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .removeDepositFromQueue(2);

      // get again and see if isCancelled is true
      const queuedDeposit2Post =
        await hre.f.SC.repositoryContracts[0].repository.depositQueue(2);
      expect(queuedDeposit2Post.isCancelled).to.be.true;

      // create another deposit
      await approveAndDeposit(bob, toBN("30000", 6));

      // check that the order is in the queue
      const nextQueuedDeposit3 =
        await hre.f.SC.repositoryContracts[0].repository.depositQueue(3);
      expect(nextQueuedDeposit3[1]).to.be.eq(
        await bob.getAddress()
      );
      expect(nextQueuedDeposit3[2]).to.be.eq(toBN("30000", 6));

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
          await bob.getAddress()
        );
    });
  });

  describe("scenario checks for cancelled - withdraw", function () {
    it("check that an order can be cancelled in the queue", async () => {
      await approveAndDeposit(bob, toBN("10000", 6), true);
      // approve repository to spend user's Lp token
      const userLpBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await bob.getAddress()
        );
      // Use approveAndWithdraw helper function for withdrawal (without processing)
      await approveAndWithdraw(bob, userLpBalance, false, 0);
      // check that the order is in the queue
      const nextQueuedWithdraw =
        await hre.f.SC.repositoryContracts[0].repository.withdrawQueue(0);
      expect(nextQueuedWithdraw[1]).to.be.eq(
        await bob.getAddress()
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
        await bob.getAddress()
      );
      expect(queuedWithdrawal[2]).to.be.eq(0);
      expect(
        await hre.f.SC.repositoryContracts[0].repository.totalQueuedWithdrawals()
      ).to.be.eq(0);
    });

    it("check an order can be cancelled and the queue can be processed", async () => {
      await approveAndDeposit(bob, toBN("10000", 6), true);
      const numOfLpTokens =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await bob.getAddress()
        );
      // check usdc balance of the repository
      const usdcBalanceOfRepository = await hre.f.SC.MockUSDC.balanceOf(
        await hre.f.SC.repositoryContracts[0].repository.getAddress()
      );
      // withdraw 10k - use approveAndWithdraw helper function
      const userTokenBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await bob.getAddress()
        );
      await approveAndWithdraw(bob, userTokenBalance, false, 0);
      // check that the order is in the queue
      const nextQueuedWithdraw =
        await hre.f.SC.repositoryContracts[0].repository.withdrawQueue(0);
      expect(nextQueuedWithdraw[1]).to.be.eq(
        await bob.getAddress()
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
          await bob.getAddress()
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
      // Give alice USDC for testing
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        await alice.getAddress(),
        toBN("100000", 6)
      );
      await approveAndDeposit(alice, toBN("10000", 6), true);
      await approveAndDeposit(bob, toBN("10000", 6), true);
      const aliceLpBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await alice.getAddress()
        );
      const bobLpBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await bob.getAddress()
        );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(await alice)
        .initiateWithdraw(aliceLpBalance, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(await bob)
        .initiateWithdraw(bobLpBalance, 0);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .removeWithdrawalFromQueue(0);

      // alice will get Repository Token back after cancel withdraw
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await alice.getAddress()
        )
      ).to.be.eq(aliceLpBalance);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await bob.getAddress()
        )
      ).to.be.eq(0);
    });
    it("alice, bob initiate withdraw. cancel bob's withdraw. alice withdrawal will be processed", async () => {
      // Give alice USDC for testing
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        await alice.getAddress(),
        toBN("100000", 6)
      );
      await approveAndDeposit(alice, toBN("10000", 6), true);
      await approveAndDeposit(bob, toBN("10000", 6), true);
      const aliceLpBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await alice.getAddress()
        );
      const bobLpBalance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await bob.getAddress()
        );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(await alice)
        .initiateWithdraw(aliceLpBalance, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(await bob)
        .initiateWithdraw(bobLpBalance, 0);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .removeWithdrawalFromQueue(1);

      // bob will get Repository Token back after cancel withdraw
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await bob.getAddress()
        )
      ).to.be.eq(bobLpBalance);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await alice.getAddress()
        )
      ).to.be.eq(0);
    });
  });
});



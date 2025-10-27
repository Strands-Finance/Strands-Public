import { hre, expect, ethers, loadFixture, createFixture, approveAndDeposit, approveAndWithdraw, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import type { Repository, RepositoryToken, TestERC20SetDecimals } from "../../typechain-types/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe(`Repository Claimable Tests`, function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;
  let repo: Repository;
  let repoToken: RepositoryToken;
  let mockUSDC: TestERC20SetDecimals;
  let controller: HardhatEthersSigner;
  const minOut = toBN("1", 6);
  const CLAIMABLE_TOLERANCE = toBN("1", 6); // Allow 1 USDC tolerance for fees
  const SMALL_BUFFER = toBN("100", 6); // Small buffer amount for tests

  const deployContractsFixture = createFixture(
    'simple',
    'none',
    'USDC',
    false,
    100000,
    "0.001"
  );

  const deployDirectInputFixture = createFixture(
    'directInput',
    'none',
    'USDC',
    false,
    100000,
    "0.001"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);
    alice = getAlice();
    bob = getBob();
    charlie = hre.f.signers[3];
    repo = hre.f.SC.repositoryContracts[0].repository;
    repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
    mockUSDC = hre.f.SC.MockUSDC;
    controller = hre.f.SC.repositoryContracts[0].controller;
  });

  describe("redeemClaimableDelegated Function", function () {
    it("should redeem claimables for multiple recipients", async function () {
      // Setup: Give alice and charlie USDC
      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("100000", 6));
      await mockUSDC.connect(hre.f.SC.deployer).mint(charlie.getAddress(), toBN("100000", 6));

      // Create deposits and withdrawals for alice, bob, and charlie
      await approveAndDeposit(alice, toBN("10000", 6), true);
      await approveAndDeposit(bob, toBN("10000", 6), true);
      await approveAndDeposit(charlie, toBN("10000", 6), true);

      const aliceTokens = await repoToken.balanceOf(alice.getAddress());
      const bobTokens = await repoToken.balanceOf(bob.getAddress());
      const charlieTokens = await repoToken.balanceOf(charlie.getAddress());

      // Initiate withdrawals
      await repo.connect(alice).initiateWithdraw(aliceTokens, minOut);
      await repo.connect(bob).initiateWithdraw(bobTokens, minOut);
      await repo.connect(charlie).initiateWithdraw(charlieTokens, minOut);

      // Process all withdrawals (this creates claimables)
      await repo.connect(controller).processWithdrawals(3);

      // Check claimables are created
      const aliceClaimable = await repo.claimable(alice.getAddress());
      const bobClaimable = await repo.claimable(bob.getAddress());
      const charlieClaimable = await repo.claimable(charlie.getAddress());

      expect(aliceClaimable).to.be.gt(0);
      expect(bobClaimable).to.be.gt(0);
      expect(charlieClaimable).to.be.gt(0);

      const totalQueuedBefore = await repo.totalQueuedClaimables();

      // Record initial balances
      const aliceBalanceBefore = await mockUSDC.balanceOf(alice.getAddress());
      const bobBalanceBefore = await mockUSDC.balanceOf(bob.getAddress());
      const charlieBalanceBefore = await mockUSDC.balanceOf(charlie.getAddress());

      // Controller redeems claimables for all three users
      await repo.connect(controller).redeemClaimableDelegated([
        await alice.getAddress(),
        await bob.getAddress(),
        await charlie.getAddress()
      ]);

      // Verify all claimables are cleared
      expect(await repo.claimable(alice.getAddress())).to.equal(0);
      expect(await repo.claimable(bob.getAddress())).to.equal(0);
      expect(await repo.claimable(charlie.getAddress())).to.equal(0);

      // Verify users received their funds
      expect(await mockUSDC.balanceOf(alice.getAddress())).to.equal(aliceBalanceBefore + aliceClaimable);
      expect(await mockUSDC.balanceOf(bob.getAddress())).to.equal(bobBalanceBefore + bobClaimable);
      expect(await mockUSDC.balanceOf(charlie.getAddress())).to.equal(charlieBalanceBefore + charlieClaimable);

      // Verify totalQueuedClaimables is cleared
      expect(await repo.totalQueuedClaimables()).to.equal(0);
      expect(totalQueuedBefore).to.equal(aliceClaimable + bobClaimable + charlieClaimable);
    });

    it("should handle mix of users with and without claimables", async function () {
      // Give alice and charlie USDC for deposits
      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("100000", 6));
      await mockUSDC.connect(hre.f.SC.deployer).mint(charlie.getAddress(), toBN("100000", 6));

      // Create claimables for bob and charlie by having them deposit and withdraw
      await approveAndDeposit(alice, toBN("5000", 6), true);
      await approveAndDeposit(charlie, toBN("5000", 6), true);

      const bobTokens = await repoToken.balanceOf(bob.getAddress());
      await repo.connect(bob).initiateWithdraw(bobTokens / 2n, minOut);
      await repo.connect(controller).processWithdrawals(1);

      const charlieTokens = await repoToken.balanceOf(charlie.getAddress());
      await repo.connect(charlie).initiateWithdraw(charlieTokens / 2n, minOut);
      await repo.connect(controller).processWithdrawals(1);

      const bobClaimable = await repo.claimable(bob.getAddress());
      const charlieClaimable = await repo.claimable(charlie.getAddress());
      expect(bobClaimable).to.be.gt(0);
      expect(charlieClaimable).to.be.gt(0);

      // Alice has no claimable
      expect(await repo.claimable(alice.getAddress())).to.equal(0);

      // Test that redeeming for alice (who has zero claimable) reverts
      await expect(
        repo.connect(controller).redeemClaimableDelegated([await alice.getAddress()])
      ).to.be.revertedWithCustomError(repo, "InvalidAmount");

      // Successfully redeem for bob and charlie together
      const bobBalanceBefore = await mockUSDC.balanceOf(bob.getAddress());
      const charlieBalanceBefore = await mockUSDC.balanceOf(charlie.getAddress());

      await repo.connect(controller).redeemClaimableDelegated([
        await bob.getAddress(),
        await charlie.getAddress()
      ]);

      expect(await mockUSDC.balanceOf(bob.getAddress())).to.equal(bobBalanceBefore + bobClaimable);
      expect(await mockUSDC.balanceOf(charlie.getAddress())).to.equal(charlieBalanceBefore + charlieClaimable);
      expect(await repo.claimable(bob.getAddress())).to.equal(0);
      expect(await repo.claimable(charlie.getAddress())).to.equal(0);
    });

    it("should enforce access control for redeemClaimableDelegated", async function () {
      // Non-controller tries to call redeemClaimableDelegated
      await expect(
        repo.connect(alice).redeemClaimableDelegated([await bob.getAddress()])
      ).to.be.revertedWithCustomError(repo, "OnlyController");
    });

    it("should revert when user has zero claimable", async function () {
      // Alice has no claimable
      expect(await repo.claimable(alice.getAddress())).to.equal(0);

      // Controller tries to redeem for alice
      await expect(
        repo.connect(controller).redeemClaimableDelegated([await alice.getAddress()])
      ).to.be.revertedWithCustomError(repo, "InvalidAmount");
    });

    it("should handle empty array input gracefully", async function () {
      // Calling with empty array should complete without error
      // This tests that the function doesn't break with edge case input
      await repo.connect(controller).redeemClaimableDelegated([]);

      // Verify state is unchanged
      expect(await repo.totalQueuedClaimables()).to.equal(0);
    });

    it("should handle duplicate addresses correctly", async function () {
      // Create a claimable for bob
      const bobTokens = await repoToken.balanceOf(bob.getAddress());
      await repo.connect(bob).initiateWithdraw(bobTokens / 2n, minOut);
      await repo.connect(controller).processWithdrawals(1);

      const bobClaimable = await repo.claimable(bob.getAddress());
      expect(bobClaimable).to.be.gt(0);

      const bobBalanceBefore = await mockUSDC.balanceOf(bob.getAddress());

      // Try to redeem for bob twice in the same call
      // First one should succeed, second should revert with InvalidAmount
      await expect(
        repo.connect(controller).redeemClaimableDelegated([
          await bob.getAddress(),
          await bob.getAddress()
        ])
      ).to.be.revertedWithCustomError(repo, "InvalidAmount");

      // Verify bob's claimable wasn't touched due to revert
      expect(await repo.claimable(bob.getAddress())).to.equal(bobClaimable);
      expect(await mockUSDC.balanceOf(bob.getAddress())).to.equal(bobBalanceBefore);
    });

    it("should emit ClaimRedeemed events for delegated redemptions", async function () {
      // Give alice USDC
      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("100000", 6));

      // Create claimables for alice and bob
      await approveAndDeposit(alice, toBN("5000", 6), true);
      const aliceTokens = await repoToken.balanceOf(alice.getAddress());
      await repo.connect(alice).initiateWithdraw(aliceTokens, minOut);
      await repo.connect(controller).processWithdrawals(1);

      const bobTokens = await repoToken.balanceOf(bob.getAddress());
      await repo.connect(bob).initiateWithdraw(bobTokens / 2n, minOut);
      await repo.connect(controller).processWithdrawals(1);

      const aliceClaimable = await repo.claimable(alice.getAddress());
      const bobClaimable = await repo.claimable(bob.getAddress());

      // Redeem via delegated function
      const tx = await repo.connect(controller).redeemClaimableDelegated([
        await alice.getAddress(),
        await bob.getAddress()
      ]);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      // Verify both ClaimRedeemed events were emitted
      await expect(tx).to.emit(repo, "ClaimRedeemed")
        .withArgs(await alice.getAddress(), block!.timestamp, aliceClaimable);

      await expect(tx).to.emit(repo, "ClaimRedeemed")
        .withArgs(await bob.getAddress(), block!.timestamp, bobClaimable);
    });
  });

  describe("totalQueuedClaimables Accounting Integrity", function () {
    it("should correctly track totalQueuedClaimables across multiple users", async function () {
      // Setup: Give alice and charlie USDC
      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("100000", 6));
      await mockUSDC.connect(hre.f.SC.deployer).mint(charlie.getAddress(), toBN("100000", 6));

      // Initial state
      expect(await repo.totalQueuedClaimables()).to.equal(0);

      // Create withdrawals for multiple users
      await approveAndDeposit(alice, toBN("5000", 6), true);
      await approveAndDeposit(bob, toBN("10000", 6), true);
      await approveAndDeposit(charlie, toBN("15000", 6), true);

      const aliceTokens = await repoToken.balanceOf(alice.getAddress());
      const bobTokens = await repoToken.balanceOf(bob.getAddress());
      const charlieTokens = await repoToken.balanceOf(charlie.getAddress());

      // Process withdrawals one by one and verify totalQueuedClaimables
      await repo.connect(alice).initiateWithdraw(aliceTokens, minOut);
      await repo.connect(controller).processWithdrawals(1);

      const aliceClaimable = await repo.claimable(alice.getAddress());
      expect(await repo.totalQueuedClaimables()).to.equal(aliceClaimable);

      await repo.connect(bob).initiateWithdraw(bobTokens, minOut);
      await repo.connect(controller).processWithdrawals(1);

      const bobClaimable = await repo.claimable(bob.getAddress());
      expect(await repo.totalQueuedClaimables()).to.equal(aliceClaimable + bobClaimable);

      await repo.connect(charlie).initiateWithdraw(charlieTokens, minOut);
      await repo.connect(controller).processWithdrawals(1);

      const charlieClaimable = await repo.claimable(charlie.getAddress());
      expect(await repo.totalQueuedClaimables()).to.equal(aliceClaimable + bobClaimable + charlieClaimable);

      // Redeem alice's claimable
      await repo.connect(alice).redeemClaimable();
      expect(await repo.totalQueuedClaimables()).to.equal(bobClaimable + charlieClaimable);

      // Redeem bob's claimable
      await repo.connect(bob).redeemClaimable();
      expect(await repo.totalQueuedClaimables()).to.equal(charlieClaimable);

      // Redeem charlie's claimable
      await repo.connect(charlie).redeemClaimable();
      expect(await repo.totalQueuedClaimables()).to.equal(0);
    });

    it("should accumulate claimables from multiple sources (cancelled deposit + withdrawal)", async function () {
      // Give alice USDC
      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("100000", 6));

      // Alice makes a successful deposit first to get tokens
      await approveAndDeposit(alice, toBN("5000", 6), true);
      const aliceTokens = await repoToken.balanceOf(alice.getAddress());
      expect(aliceTokens).to.be.gt(0);

      // Alice deposits 10k but it gets cancelled - creates claimable
      await approveAndDeposit(alice, toBN("10000", 6), false);
      const depositId = (await repo.depositHead()) - 1n;
      await repo.connect(controller).removeDepositFromQueue(depositId);

      const claimableFromCancelledDeposit = await repo.claimable(alice.getAddress());
      expect(claimableFromCancelledDeposit).to.equal(toBN("10000", 6));

      // Now alice withdraws her tokens - creates more claimable
      await repo.connect(alice).initiateWithdraw(aliceTokens, minOut);
      await repo.connect(controller).processWithdrawals(1);

      const claimableFromWithdrawal = (await repo.claimable(alice.getAddress())) - claimableFromCancelledDeposit;
      expect(claimableFromWithdrawal).to.be.gt(0);

      // Total claimable should be sum of both
      const totalClaimable = await repo.claimable(alice.getAddress());
      expect(totalClaimable).to.be.closeTo(
        claimableFromCancelledDeposit + claimableFromWithdrawal,
        CLAIMABLE_TOLERANCE
      );

      // Verify totalQueuedClaimables matches
      expect(await repo.totalQueuedClaimables()).to.equal(totalClaimable);

      // Redeem all at once
      const balanceBefore = await mockUSDC.balanceOf(alice.getAddress());
      await repo.connect(alice).redeemClaimable();

      expect(await mockUSDC.balanceOf(alice.getAddress())).to.equal(balanceBefore + totalClaimable);
      expect(await repo.totalQueuedClaimables()).to.equal(0);
    });
  });

  describe("Withdrawal Processing with Claimables", function () {
    it("should revert with InsufficientLocalFundsToProcessRedemption when totalQueuedClaimables exhausts balance", async function () {
      // This test uses directInputBookkeeper to mark value as off-chain,
      // which inflates the NAV while keeping actual on-chain balance low.
      // Combined with large claimables, this creates insufficient funds for withdrawals.

      // Load the directInput fixture instead
      await loadFixture(deployDirectInputFixture);
      const directRepo = hre.f.SC.repositoryContracts[0].repository;
      const directRepoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
      const directController = hre.f.SC.repositoryContracts[0].controller;
      const directBookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper;
      const directAlice = getAlice();
      const directBob = getBob();

      // Give alice USDC
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(directAlice.getAddress(), toBN("100000", 6));

      // Create a large claimable (80k USDC)
      await hre.f.SC.MockUSDC.connect(directAlice).approve(directRepo.getAddress(), toBN("80000", 6));
      await directRepo.connect(directAlice).initiateDeposit(toBN("80000", 6), 0);
      await directRepo.connect(directController).removeDepositFromQueue((await directRepo.depositHead()) - 1n);

      const claimables = await directRepo.totalQueuedClaimables();
      expect(claimables).to.equal(toBN("80000", 6));

      // Set acceptable margin of error for NAV checks
      await directBookKeeper.connect(directController).setAcceptableMarginOfError(toBN("1")); // 100% margin

      // Mark value as being held off-chain
      // This inflates the NAV calculation while keeping on-chain balance low
      const currentNav = await directRepo.getNAV();
      const totalSupply = await directRepoToken.totalSupply();
      const totalValue = (totalSupply * currentNav) / toBN("1", 18);

      // Mark 80% of total value as off-chain
      const offChainValue = (totalValue * 80n) / 100n;
      const latestBlock = await hre.ethers.provider.getBlock("latest");

      await directBookKeeper.connect(directController).markValueOffChain18(
        offChainValue,
        latestBlock!.timestamp,
        3600 // valid for 1 hour
      );

      // Now NAV is inflated, so bob's withdrawal will be calculated based on higher NAV
      const bobTokens = await directRepoToken.balanceOf(directBob.getAddress());
      const nav = await directRepo.getNAV();
      const bobWithdrawalAmount18 = (bobTokens * nav) / toBN("1", 18);
      const bobWithdrawalAmount = bobWithdrawalAmount18 / toBN("1", 12); // Convert to 6 decimals

      // Check current on-chain balance
      const currentBalance = await hre.f.SC.MockUSDC.balanceOf(directRepo.getAddress());
      const totalQueuedDeposits = await directRepo.totalQueuedDeposits();

      // The on-chain balance should be insufficient for: deposits + claimables + bob's withdrawal
      // because bob's withdrawal is calculated based on inflated NAV
      expect(currentBalance).to.be.lt(totalQueuedDeposits + claimables + bobWithdrawalAmount);

      // Bob initiates withdrawal
      await directRepo.connect(directBob).initiateWithdraw(bobTokens, minOut);

      // This should fail with InsufficientLocalFundsToProcessRedemption
      await expect(
        directRepo.connect(directController).processWithdrawals(1)
      ).to.be.revertedWithCustomError(directRepo, "InsufficientLocalFundsToProcessRedemption");
    });

    it("should correctly account for totalQueuedClaimables in balance checks", async function () {
      // This test verifies that processWithdrawals correctly accounts for totalQueuedClaimables
      // by ensuring withdrawals can still be processed when there are sufficient funds

      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("100000", 6));

      // Create a large claimable by depositing and cancelling
      const largeAmount = toBN("80000", 6);
      await approveAndDeposit(alice, largeAmount, false);
      await repo.connect(controller).removeDepositFromQueue((await repo.depositHead()) - 1n);

      // Verify claimable was created
      const claimables = await repo.totalQueuedClaimables();
      expect(claimables).to.equal(largeAmount);

      // Get repository state before bob's withdrawal
      const balanceBefore = await mockUSDC.balanceOf(repo.getAddress());
      const bobTokens = await repoToken.balanceOf(bob.getAddress());
      const nav = await repo.getNAV();
      const bobWithdrawalAmount18 = (bobTokens * nav) / toBN("1", 18);
      const bobWithdrawalAmount = bobWithdrawalAmount18 / toBN("1", 12); // Convert 18 decimals to 6
      const totalQueuedDeposits = await repo.totalQueuedDeposits();

      // Verify we have enough funds for: deposits + claimables + bob's withdrawal
      expect(balanceBefore).to.be.gte(totalQueuedDeposits + claimables + bobWithdrawalAmount);

      // Bob initiates and processes withdrawal - should succeed
      await repo.connect(bob).initiateWithdraw(bobTokens, minOut);
      await repo.connect(controller).processWithdrawals(1);

      // Verify bob now has a claimable (withdrawal was processed successfully)
      const bobClaimable = await repo.claimable(bob.getAddress());
      expect(bobClaimable).to.be.gt(0);

      // Verify total claimables increased
      expect(await repo.totalQueuedClaimables()).to.equal(claimables + bobClaimable);

      // Both alice and bob should be able to redeem their claimables
      const aliceBalanceBefore = await mockUSDC.balanceOf(alice.getAddress());
      await repo.connect(alice).redeemClaimable();
      expect(await mockUSDC.balanceOf(alice.getAddress())).to.equal(aliceBalanceBefore + claimables);

      const bobBalanceBefore = await mockUSDC.balanceOf(bob.getAddress());
      await repo.connect(bob).redeemClaimable();
      expect(await mockUSDC.balanceOf(bob.getAddress())).to.equal(bobBalanceBefore + bobClaimable);
    });

    it("should successfully process withdrawal when enough funds available", async function () {
      // Add extra funds to repository
      await mockUSDC.connect(hre.f.SC.deployer).mint(repo.getAddress(), toBN("100000", 6));

      // Create claimables and queued deposits
      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("100000", 6));

      // Cancelled deposit creates claimable
      await approveAndDeposit(alice, toBN("10000", 6), false);
      await repo.connect(controller).removeDepositFromQueue((await repo.depositHead()) - 1n);

      // Queued deposit
      await approveAndDeposit(alice, toBN("10000", 6), false);

      // Bob withdraws
      const bobTokens = await repoToken.balanceOf(bob.getAddress());
      await repo.connect(bob).initiateWithdraw(bobTokens, minOut);

      // Should succeed now with extra funds
      await repo.connect(controller).processWithdrawals(1);

      // Verify bob has claimable
      expect(await repo.claimable(bob.getAddress())).to.be.gt(0);
    });
  });

  describe("moveFundsToExecutor with Claimables", function () {
    it("should prevent moving funds when totalQueuedClaimables would be violated", async function () {
      // This test verifies that moveFundsToExecutor correctly checks totalQueuedClaimables

      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("100000", 6));

      // Create claimable for alice
      await approveAndDeposit(alice, toBN("20000", 6), false);
      await repo.connect(controller).removeDepositFromQueue((await repo.depositHead()) - 1n);

      const totalQueuedClaimables = await repo.totalQueuedClaimables();
      expect(totalQueuedClaimables).to.equal(toBN("20000", 6));

      const repoBalanceBefore = await mockUSDC.balanceOf(repo.getAddress());

      // Try to move funds that would leave insufficient balance for claimables
      // Repository has ~70k (50k initial + 20k from alice)
      // Need to keep 20k for claimables
      // Try to move 60k, leaving only 10k - this should fail

      const amountToMove = repoBalanceBefore - toBN("10000", 6); // Try to leave only 10k

      // This should now FAIL because: balance < amount + totalQueuedDeposits + totalQueuedClaimables
      // 70k < 60k + 0 + 20k (FALSE - would leave only 10k, but need 20k for claimables)
      await expect(
        repo.connect(controller).moveFundsToExecutor(amountToMove)
      ).to.be.revertedWithCustomError(repo, "InsufficientLocalBalanceToTransfer");

      // Verify alice can still redeem (funds weren't moved)
      await repo.connect(alice).redeemClaimable();
      expect(await repo.claimable(alice.getAddress())).to.equal(0);
    });

    it("should successfully move funds when enough balance after accounting for claimables", async function () {
      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("100000", 6));

      // Create claimable for alice
      await approveAndDeposit(alice, toBN("10000", 6), false);
      await repo.connect(controller).removeDepositFromQueue((await repo.depositHead()) - 1n);

      const totalQueuedClaimables = await repo.totalQueuedClaimables();
      expect(totalQueuedClaimables).to.equal(toBN("10000", 6));

      // Repository has ~60k (50k initial + 10k from alice), claimables = 10k
      // So we can safely move ~40k and still leave enough for claimables

      const repoBalance = await mockUSDC.balanceOf(repo.getAddress());
      const safeAmount = repoBalance - totalQueuedClaimables - toBN("1000", 6); // Leave 1k buffer

      await repo.connect(controller).moveFundsToExecutor(safeAmount);

      // Alice should still be able to redeem
      await repo.connect(alice).redeemClaimable();
    });
  });

  describe("Edge Cases", function () {
    it("should revert when user calls redeemClaimable with zero balance", async function () {
      // Alice has no claimable
      expect(await repo.claimable(alice.getAddress())).to.equal(0);

      await expect(
        repo.connect(alice).redeemClaimable()
      ).to.be.revertedWithCustomError(repo, "InvalidAmount");
    });

    it("should handle same user redeeming multiple times after separate claimable creations", async function () {
      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("100000", 6));

      // First claimable from cancelled deposit
      await approveAndDeposit(alice, toBN("10000", 6), false);
      await repo.connect(controller).removeDepositFromQueue((await repo.depositHead()) - 1n);

      const firstClaimable = await repo.claimable(alice.getAddress());
      const balanceBefore1 = await mockUSDC.balanceOf(alice.getAddress());

      // Redeem first claimable
      await repo.connect(alice).redeemClaimable();
      expect(await mockUSDC.balanceOf(alice.getAddress())).to.equal(balanceBefore1 + firstClaimable);
      expect(await repo.claimable(alice.getAddress())).to.equal(0);

      // Create second claimable from cancelled deposit
      await approveAndDeposit(alice, toBN("5000", 6), false);
      await repo.connect(controller).removeDepositFromQueue((await repo.depositHead()) - 1n);

      const secondClaimable = await repo.claimable(alice.getAddress());
      const balanceBefore2 = await mockUSDC.balanceOf(alice.getAddress());

      // Redeem second claimable
      await repo.connect(alice).redeemClaimable();
      expect(await mockUSDC.balanceOf(alice.getAddress())).to.equal(balanceBefore2 + secondClaimable);
      expect(await repo.claimable(alice.getAddress())).to.equal(0);
    });

    it("should emit ClaimableCreated event correctly", async function () {
      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("100000", 6));

      await approveAndDeposit(alice, toBN("10000", 6), false);

      const tx = await repo.connect(controller).removeDepositFromQueue((await repo.depositHead()) - 1n);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx).to.emit(repo, "ClaimableCreated")
        .withArgs(await alice.getAddress(), toBN("10000", 6), block!.timestamp);
    });

    it("should emit ClaimRedeemed event correctly", async function () {
      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("100000", 6));

      await approveAndDeposit(alice, toBN("10000", 6), false);
      await repo.connect(controller).removeDepositFromQueue((await repo.depositHead()) - 1n);

      const claimableAmount = await repo.claimable(alice.getAddress());

      const tx = await repo.connect(alice).redeemClaimable();
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      await expect(tx).to.emit(repo, "ClaimRedeemed")
        .withArgs(await alice.getAddress(), block!.timestamp, claimableAmount);
    });
  });
});

import { hre, expect, ethers, loadFixture, createFixture, approveAndDeposit, approveAndWithdraw, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import type { Repository, RepositoryToken, TestERC20SetDecimals } from "../../typechain-types/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe(`Repository Withdraw`, function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let repo: Repository;
  let repoToken: RepositoryToken;
  let mockUSDC: TestERC20SetDecimals;
  let controller: HardhatEthersSigner;
  const minOut = toBN("1", 6);

  const deployContractsFixture = createFixture(
    'accountNFT',
    'none',
    'USDC',
    false,
    50000,
    "0.001"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);
    alice = getAlice();
    bob = getBob();
    repo = hre.f.SC.repositoryContracts[0].repository;
    repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
    mockUSDC = hre.f.SC.MockUSDC;
    controller = hre.f.SC.repositoryContracts[0].controller;
  });

  describe("Withdrawal Validation", function () {
    it("should validate zero amount withdrawals", async function () {
      await expect(repo.initiateWithdraw(0, minOut))
        .to.be.revertedWithCustomError(repo, "InvalidAmount");
    });
  });

  describe("Insufficient Funds Handling", function () {
    it("should handle insufficient funds scenario", async function () {
      await approveAndDeposit(alice, toBN("100", 6), false);
      await hre.f.SC.repositoryContracts[0].bookKeeper.connect(controller).setIncludeExecutor(true);
      await repo.connect(controller).moveFundsToExecutor(toBN("2000", 6));
      await repo.connect(bob).initiateWithdraw(toBN("50000", 18), toBN("50000", 6));
      await hre.f.SC.repositoryContracts[0].bookKeeper.connect(controller).markValueOffChainSettled(true);

      await expect(repo.connect(controller).processWithdrawals(1))
        .to.be.revertedWithCustomError(repo, "InsufficientLocalFundsToProcessRedemption");
    });
  });

  describe("Complete Withdrawal", function () {
    it("should handle complete withdrawal", async function () {
      // Note: Fixture already gives alice 100k USDC
      // We mint another 100k to test with 200k total
      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("100000", 6));

      const aliceBalanceBefore = await mockUSDC.balanceOf(alice.getAddress());
      // Alice should have 200k (100k from fixture + 100k just minted)
      expect(aliceBalanceBefore).to.be.eq(toBN("200000", 6));

      await approveAndDeposit(alice, toBN("10000", 6), true, 'USDC');

      const aliceTokens = await repoToken.balanceOf(alice.getAddress());
      expect(aliceTokens).to.be.closeTo(toBN("10000"), toBN("1")); // Verify alice has expected tokens

      const aliceBalanceAfterDeposit = await mockUSDC.balanceOf(alice.getAddress());
      // Alice deposited 10k from her balance
      expect(aliceBalanceAfterDeposit).to.be.eq(toBN("190000", 6));

      await approveAndWithdraw(alice, aliceTokens, true, minOut);
      expect(await repoToken.balanceOf(alice.getAddress())).to.equal(0);

      // Redeem the claimable to get USDC back
      await repo.connect(alice).redeemClaimable();

      const finalAliceBalance = await mockUSDC.balanceOf(alice.getAddress());
      // Alice withdrew ~10k tokens at NAV ~1, minus fee (0.1% = ~10 USDC)
      // Final balance should be ~200k - 10 = ~199,990 USDC
      expect(finalAliceBalance).to.be.closeTo(toBN("200000", 6), toBN("20", 6));
    });
  });

  describe("Partial Withdrawal", function () {
    it("should handle partial withdrawals with fees", async function () {
      await hre.f.SC.repositoryFactory.connect(hre.f.SC.deployer).setFeeRecipient(hre.f.signers[1].address);

      const bobTokens = await repoToken.balanceOf(bob.getAddress());
      expect(bobTokens).to.equal(toBN("50000")); // Verify initial state

      await approveAndWithdraw(bob, bobTokens / 2n, false, minOut);
      expect(await repoToken.balanceOf(bob.getAddress())).to.equal(bobTokens / 2n);

      await repo.connect(controller).processWithdrawals(1);
      await repo.connect(bob).redeemClaimable();

      expect(await mockUSDC.balanceOf(repo.getAddress())).to.be.closeTo(toBN("25000", 6), toBN("1", 6));
      expect(await mockUSDC.balanceOf(bob.getAddress())).to.be.closeTo(toBN("25000", 6), toBN("1", 6));
    });
  });

  describe("Withdrawal Queue Management", function () {
    it("should process withdrawals sequentially with correct queue state", async () => {
      const amount = toBN("1000");
      const initialQueueIndex = await repo.withdrawHead();
      const initialRepoBalance = await mockUSDC.balanceOf(repo.getAddress());
      const initialUserBalance = await mockUSDC.balanceOf(bob.getAddress());

      // Process 3 sequential withdrawals
      for (let i = 1; i <= 3; i++) {
        await repo.connect(bob).initiateWithdraw(amount, minOut);
        await repo.connect(controller).processWithdrawals(1);

        expect(await repo.withdrawHead()).to.equal(initialQueueIndex + BigInt(i));

        const currentUserBalance = await mockUSDC.balanceOf(bob.getAddress());
        const currentLicenseFee = await mockUSDC.balanceOf(hre.f.SC.repositoryContracts[0].feeRecipient.address);

        expect(await mockUSDC.balanceOf(repo.getAddress()))
          .to.equal(initialRepoBalance - (currentUserBalance - initialUserBalance) - currentLicenseFee);
      }
    });
  });

  describe("NAV Changes and Multi-Deposit Scenarios", () => {
    it("should handle withdrawals after NAV changes and multiple deposits", async () => {
      const amount = toBN("10000", 6);
      const aliceInitialBalance = await mockUSDC.balanceOf(alice.getAddress());

      // Test 1: Deposit, double NAV, withdraw
      await approveAndDeposit(alice, amount, true);
      const tokenBalance = await repoToken.balanceOf(alice.getAddress());

      const AUM = await repo.getAUM();
      const [NAV] = await hre.f.SC.repositoryContracts[0].bookKeeper.getNAV();

      // Double AUM
      await mockUSDC.connect(hre.f.SC.deployer).mint(repo.getAddress(), AUM / toBN("1", 12));
      await hre.f.SC.repositoryContracts[0].bookKeeper.connect(controller).updateValueOffChain18(1000, NAV * 2n);

      await repo.connect(alice).initiateWithdraw(tokenBalance, minOut);
      await repo.connect(controller).processWithdrawals(1);
      await repo.connect(alice).redeemClaimable();

      expect(await repoToken.balanceOf(alice.getAddress())).to.be.eq(0);

      const feeCollected = await mockUSDC.balanceOf(hre.f.SC.repositoryContracts[0].feeRecipient.address);
      expect(await mockUSDC.balanceOf(alice.getAddress()))
        .to.be.closeTo(aliceInitialBalance - amount + (2n * amount) - feeCollected, 100);

      // Test 2: Multiple deposits at different NAVs
      const aliceBalanceReset = await mockUSDC.balanceOf(alice.getAddress());
      await approveAndDeposit(alice, amount, true);

      // Double NAV again
      const newAUM = await repo.getAUM();
      const [newNAV] = await hre.f.SC.repositoryContracts[0].bookKeeper.getNAV();
      await mockUSDC.connect(hre.f.SC.deployer).mint(repo.getAddress(), newAUM / toBN("1", 12));
      await hre.f.SC.repositoryContracts[0].bookKeeper.connect(controller).updateValueOffChain18(1000, newNAV * 2n);

      await approveAndDeposit(alice, amount, true);

      const tokens = await repoToken.balanceOf(alice.getAddress());
      const balanceBeforeWithdrawal = await mockUSDC.balanceOf(alice.getAddress());

      await repo.connect(alice).initiateWithdraw(tokens, minOut);
      await repo.connect(controller).processWithdrawals(1);
      await repo.connect(alice).redeemClaimable();

      const balanceAfterWithdrawal = await mockUSDC.balanceOf(alice.getAddress());
      const actualWithdrawal = balanceAfterWithdrawal - balanceBeforeWithdrawal;
      const expectedBalance = aliceBalanceReset - (2n * amount) + actualWithdrawal;

      expect(await mockUSDC.balanceOf(alice.getAddress()))
        .to.be.closeTo(expectedBalance, toBN("0.001", 6));
    });
  });

  describe("Minimum Payout Validation", () => {
    it("should reject withdrawals that don't meet minimum payout", async () => {
      await mockUSDC.connect(hre.f.SC.deployer).mint(alice.getAddress(), toBN("200000", 6));
      const amount = toBN("50000", 6);
      await approveAndDeposit(alice, amount, true, 'USDC');

      const aliceTokens = await repoToken.balanceOf(alice.getAddress());
      const aliceUSDCBalance = await mockUSDC.balanceOf(alice.getAddress());

      // Set unrealistic minimum payout
      await repo.connect(alice).initiateWithdraw(aliceTokens, toBN("10000000"));
      await repo.connect(controller).processWithdrawals(1);

      // Alice should keep her tokens and USDC unchanged
      expect(await mockUSDC.balanceOf(alice.getAddress())).to.be.eq(aliceUSDCBalance);
      expect(await repoToken.balanceOf(alice.getAddress())).to.be.eq(aliceTokens);
    });
  });

  describe("Bulk Withdrawal Operations", function () {
    it('should handle initiateWithdrawAllFor with proper event emissions', async () => {
      const withdrawalArray = [bob.getAddress()];

      // Test 1: User with zero balance should emit InvalidWithdrawQueued
      await repoToken.connect(bob).transfer(alice.getAddress(), toBN("50000"));
      expect(await repoToken.balanceOf(bob.getAddress())).to.be.eq(0);

      await expect(repo.connect(controller).initiateWithdrawAllFor(withdrawalArray))
        .to.emit(repo, "InvalidWithdrawQueued");

      // Test 2: User with valid balance should not emit InvalidWithdrawQueued
      await repoToken.connect(alice).transfer(bob.getAddress(), toBN("50000"));
      expect(await repoToken.balanceOf(bob.getAddress())).to.be.eq(toBN("50000"));

      await expect(repo.connect(controller).initiateWithdrawAllFor(withdrawalArray))
        .to.not.emit(repo, "InvalidWithdrawQueued");
    });
  });

});

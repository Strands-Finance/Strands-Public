import { hre, expect, loadFixture, createFixture, approveAndDeposit, approveAndWithdraw, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { fromBN, toBN } from "../helpers/testUtils.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe(`Repository NAV Calculations`, function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  const deployContractsFixture = createFixture(
    'directInput',
    'none',
    'USDC',
    true,
    0,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);
    alice = getAlice();
    bob = getBob();
  });

  describe("NAV Calculation Scenarios", function () {
    it("should calculate NAV correctly with multiple deposits", async () => {
      const repo = hre.f.SC.repositoryContracts[0].repository;
      const repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
      const controller = hre.f.SC.repositoryContracts[0].controller;

      expect(await repo.getNAV()).to.be.eq(toBN("1"));

      // Initial deposit
      const amount = 100;
      await approveAndDeposit(alice, toBN(amount, 6));
      await repo.connect(controller).processDeposits(1);
      expect(await repo.getNAV()).to.be.eq(toBN("1"));

      // Second deposit
      await approveAndDeposit(alice, toBN(amount, 6));
      await repo.connect(controller).processDeposits(1);

      // Verify NAV calculation matches expected formula
      const usdcAmount = await hre.f.SC.MockUSDC.balanceOf(repo.getAddress());
      const totalSupply = await repoToken.totalSupply();
      const calculatedNav = await repo.getNAV();

      const expectedPrice = fromBN(totalSupply) > 0 ? fromBN(usdcAmount, 6) / fromBN(totalSupply) : 0;
      expect(calculatedNav).to.be.eq(toBN(expectedPrice.toString()));
    });

    it("should handle large withdrawals and maintain NAV integrity", async () => {
      const repo = hre.f.SC.repositoryContracts[0].repository;
      const repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
      const controller = hre.f.SC.repositoryContracts[0].controller;

      expect(await repo.getNAV()).to.be.eq(toBN("1"));
      expect(await hre.f.SC.MockUSDC.balanceOf(alice.address)).to.be.eq(toBN("100000", 6));

      // Large deposits from both users
      await approveAndDeposit(alice, toBN("100000", 6));
      await repo.connect(controller).processDeposits(1);

      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(bob.address, toBN("100000", 6));
      await approveAndDeposit(bob, toBN("100000", 6));
      await repo.connect(controller).processDeposits(1);

      // Alice withdraws all her tokens
      expect(await hre.f.SC.MockUSDC.balanceOf(alice.address)).to.be.eq(0);
      const aliceTokens = await repoToken.balanceOf(alice.address);

      await approveAndWithdraw(alice, aliceTokens, true, 0);
      await expect(repo.connect(alice).redeemClaimable())
        .to.emit(repo, "ClaimRedeemed");

      expect(await hre.f.SC.MockUSDC.balanceOf(alice.address))
        .to.be.closeTo(toBN("100000", 6), toBN("1", 6));
    });

    it("should demonstrate NAV growth with external value addition", async () => {
      const repo = hre.f.SC.repositoryContracts[0].repository;
      const repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
      const controller = hre.f.SC.repositoryContracts[0].controller;
      const amount = 10000;

      expect(await repo.getNAV()).to.be.eq(toBN("1"));

      // Record initial balances (fixture gives alice 100k, bob gets 0)
      const aliceInitialBalance = await hre.f.SC.MockUSDC.balanceOf(alice.address);
      expect(aliceInitialBalance).to.be.eq(toBN("100000", 6)); // From fixture

      const bobInitialBalance = await hre.f.SC.MockUSDC.balanceOf(bob.address);

      // Both users deposit equal amounts
      await approveAndDeposit(alice, toBN(amount, 6));
      await repo.connect(controller).processDeposits(1);
      expect(await repo.getNAV()).to.be.eq(toBN("1"));

      // Mint 10k to bob, then he deposits it
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(bob.address, toBN(amount, 6));
      await approveAndDeposit(bob, toBN(amount, 6));
      await repo.connect(controller).processDeposits(1);

      // NAV should still be 1 (20k AUM, 20k tokens)
      expect(await repo.getNAV()).to.be.eq(toBN("1"));

      // Simulate external gains by adding USDC to repository
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(repo.getAddress(), toBN(amount, 6));

      // NAV should now be 1.5 (30k AUM, 20k tokens)
      const navPost = await repo.getNAV();
      expect(navPost).to.be.eq(toBN("1.5"));

      // Both users should have exactly 10k tokens each
      const aliceTokens = await repoToken.balanceOf(alice.address);
      const bobTokens = await repoToken.balanceOf(bob.address);

      expect(aliceTokens).to.be.eq(toBN(amount.toString()));
      expect(bobTokens).to.be.eq(toBN(amount.toString()));

      // Alice withdraws: 10k tokens * NAV 1.5 = 15k USDC
      await approveAndWithdraw(alice, aliceTokens, true, 0);
      await repo.connect(alice).redeemClaimable();
      expect(await hre.f.SC.MockUSDC.balanceOf(alice.address))
        .to.be.eq(aliceInitialBalance - toBN(amount, 6) + toBN("15000", 6));

      // Bob withdraws: 10k tokens * NAV 1.5 = 15k USDC
      await approveAndWithdraw(bob, bobTokens, true, 0);
      await repo.connect(bob).redeemClaimable();

      const bobFinalBalance = await hre.f.SC.MockUSDC.balanceOf(bob.address);

      // Bob: started with 100k, received 10k mint (110k), deposited 10k (100k), withdrew 15k (115k)
      // Net change from initial: +15k
      expect(bobFinalBalance).to.be.closeTo(bobInitialBalance + toBN("15000", 6), toBN("20", 6));
    });
  });
});



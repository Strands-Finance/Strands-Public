import { hre, expect, loadFixture, createFixture, seedWithUSDC, approveAndDeposit, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe(`Repository Deposit Operations`, function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  const usdcFixture = createFixture('directInput', 'none', 'USDC', true, 0, "0");
  const wethFixture = createFixture('directInput', 'none', 'WETH', true, 0, "0");

  describe("USDC Deposit Operations", function () {
    beforeEach(async () => {
      await loadFixture(usdcFixture);
      alice = getAlice();
      bob = getBob();
    });

    it("should handle basic deposit validation and operations", async function () {
      const repo = hre.f.SC.repositoryContracts[0].repository;
      const repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;

      // Test zero amount validation
      await expect(repo.initiateDeposit(0, 0))
        .to.be.revertedWithCustomError(repo, "InvalidAmount");

      // Test basic deposit and token minting
      expect(await hre.f.SC.MockUSDC.balanceOf(await alice.getAddress())).equal(toBN("100000", 6));

      const amount = toBN("1000", 6);
      await approveAndDeposit(alice, amount, true, 'USDC');

      expect(await repoToken.balanceOf(await alice.getAddress())).to.be.closeTo(toBN("1000", 18), toBN("1"));
      expect(await repo.getNAV()).to.be.closeTo(toBN("1"), toBN("0.001"));
    });

    it("should handle multi-user deposits and NAV calculations", async () => {
      const repo = hre.f.SC.repositoryContracts[0].repository;
      const repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
      const bookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper;
      const controller = hre.f.SC.repositoryContracts[0].controller;

      const [usdcAmount, amount] = [100e6, toBN("100")];
      await seedWithUSDC(bob);

      // Multi-user deposit test
      await approveAndDeposit(alice, usdcAmount, true, 'USDC');
      await approveAndDeposit(bob, usdcAmount, true, 'USDC');

      expect(await repoToken.balanceOf(await alice.getAddress())).to.be.closeTo(amount, toBN("1"));
      expect(await repoToken.balanceOf(await bob.getAddress())).to.be.closeTo(amount, toBN("1"));
      expect(await repoToken.totalSupply()).to.be.closeTo(toBN("200"), toBN("0.1"));

      // Test NAV update scenario
      const nav = await repo.getNAV();
      await bookKeeper.connect(controller).markValueOffChain18(toBN("200"), 1000, nav * 2n);
      expect(await repo.getNAV()).to.be.closeTo(toBN("2"), toBN("0.1"));
    });

    it("should calculate correct tokens after value changes", async function () {
      const repo = hre.f.SC.repositoryContracts[0].repository;
      const repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
      const bookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper;
      const controller = hre.f.SC.repositoryContracts[0].controller;

      const [usdcAmount, amount] = [100e6, toBN("100")];
      await seedWithUSDC(bob);

      // First deposit
      await approveAndDeposit(alice, usdcAmount, true, 'USDC');
      const nav = await repo.getNAV();
      expect(await repoToken.balanceOf(await alice.getAddress())).to.be.closeTo(amount, toBN("1"));

      // Double the pool value
      await bookKeeper.connect(controller).markValueOffChain18(toBN("100"), 1000, nav * 2n);

      // Second deposit at higher NAV
      await approveAndDeposit(bob, usdcAmount, true, 'USDC');
      expect(await repo.getNAV()).to.be.closeTo(toBN("2"), toBN("0.1"));
      expect(await repoToken.balanceOf(await bob.getAddress())).to.be.closeTo(toBN("50"), toBN("0.1"));
      expect(await repoToken.totalSupply()).to.be.closeTo(toBN("150"), toBN("0.1"));
    });

    it("should reject ETH deposits for USDC repositories", async function () {
      await expect(
        hre.f.SC.repositoryContracts[0].repository.connect(alice).initiateDepositEth(0, {
          value: toBN('1', 6)
        })
      ).to.be.revertedWithCustomError(hre.f.SC.repositoryContracts[0].repository, "CannnotDepositAssetType");
    });
  });
  describe("WETH Deposit Operations", function () {
    beforeEach(async () => {
      await loadFixture(wethFixture);
      alice = getAlice();
      bob = getBob();
    });

    it("should handle ETH deposits for WETH repositories", async function () {
      const repo = hre.f.SC.repositoryContracts[0].repository;
      const repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
      const controller = hre.f.SC.repositoryContracts[0].controller;
      const amount = toBN("1");

      await repo.connect(alice).initiateDepositEth(toBN('1'), { value: amount });
      expect(await hre.f.SC.MockWETH.balanceOf(repo.getAddress())).equal(amount);

      await repo.connect(controller).processDeposits(1);
      // Expect exactly 1 WETH worth of tokens (with tiny tolerance for rounding)
      expect(await repoToken.balanceOf(await alice.getAddress())).to.be.closeTo(amount, toBN("0.001", 18));
    });
  });
});


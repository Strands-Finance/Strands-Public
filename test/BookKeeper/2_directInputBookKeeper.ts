import { fastForward } from "../helpers/evm.js";
import { expect, hre, ethers, loadFixture, createFixture, approveAndDeposit, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN,fromBN } from "../helpers/testUtils.js";
import type { Repository, RepositoryToken, TestERC20SetDecimals, DirectInputBookKeeper } from "../../typechain-types/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe(`directInputBookKeeper`, () => {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  // Contract shortcuts for better readability
  let repo: Repository;
  let repoToken: RepositoryToken;
  let mockUSDC: TestERC20SetDecimals;
  let bookKeeper: DirectInputBookKeeper;
  let controller: HardhatEthersSigner;

  // Cached addresses to avoid repeated async calls
  let repoAddress: string;
  let aliceAddress: string;
  let bobAddress: string;

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

    // Initialize signers
    alice = getAlice();
    bob = getBob();

    // Set up contract shortcuts
    repo = hre.f.SC.repositoryContracts[0].repository;
    repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
    mockUSDC = hre.f.SC.MockUSDC;
    bookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper;
    controller = hre.f.SC.repositoryContracts[0].controller;

    // Cache frequently used addresses
    [repoAddress, aliceAddress, bobAddress] = await Promise.all([
      repo.getAddress(),
      alice.getAddress(),
      bob.getAddress()
    ]);
  });

  describe("base line testing", () => {
    it("should mark repository value correctly", async () => {
      const [oldValueUsd] = await bookKeeper.getAUM();
      const newValue = toBN("1");
      await bookKeeper.connect(controller).markValueOffChain18(newValue, 1000, toBN("1"));
      const [markedValueUsd] = await bookKeeper.getAUM();
      expect(markedValueUsd).to.equal(newValue);
      expect(markedValueUsd).to.not.equal(oldValueUsd);
    });

    it("should revert when non-controller tries to mark repository value", async () => {
      const [oldValueUsd] = await bookKeeper.getAUM();
      const newValue = toBN("1");

      await expect(
        bookKeeper.connect(alice).markValueOffChain18(newValue, 1000, toBN("1"))
      ).to.be.revertedWithCustomError(bookKeeper, "OnlyRepositoryController");

      const [currentValueUsd] = await bookKeeper.getAUM();
      expect(currentValueUsd).to.be.eq(oldValueUsd);
    });

    it("should allow marking positive value off-chain on unseeded repository", async () => {
      // Verify repository is unseeded (no token supply)
      const totalSupply = await repoToken.totalSupply();
      expect(totalSupply).to.equal(0);

      // Verify initial state
      const initialAUM = await repo.getAUM();
      expect(initialAUM).to.equal(0);
      const initialNAV = await repo.getNAV();
      expect(initialNAV).to.equal(toBN("1")); // Default NAV when no supply

      // Attempt to mark positive value off-chain with zero supply
      const zeroValue = toBN("0");
      await bookKeeper.connect(controller).markValueOffChain18(zeroValue, 1000, toBN("1"));


      const positiveValue = toBN("1000");
      await bookKeeper.connect(controller).markValueOffChain18(positiveValue, 1000, toBN("1"));

      // Verify the value was set
      expect(await bookKeeper.valueOffChain18()).to.equal(positiveValue);

      // AUM should now reflect the off-chain value
      const newAUM = await repo.getAUM();
      expect(newAUM).to.equal(positiveValue);

      // NAV should still be 1 (default) since there's no supply
      const newNAV = await repo.getNAV();
      expect(newNAV).to.equal(toBN("1"));
    });
  });

  describe("NAV and AUM Staleness", () => {
    it("should handle staleness and return lastKnown values correctly", async () => {
      const amount = toBN("100", 6);
      await approveAndDeposit(alice, amount, true, 'USDC');
      expect(await repoToken.balanceOf(aliceAddress)).to.be.closeTo(toBN("100"), toBN("0.1"));

      const newOutside18 = toBN("0.000001");
      const totalSupply = await repoToken.totalSupply();
      const currentAUM = await repo.getAUM();
      const expectedAUM = currentAUM + newOutside18;
      const expectedNAV = expectedAUM * toBN("1") / totalSupply;

      await bookKeeper.connect(controller).markValueOffChain18(newOutside18, 1, expectedNAV);
      await fastForward(10);

      // Both NAV and AUM should revert when stale
      await expect(repo.getNAV()).to.be.revertedWithCustomError(bookKeeper, "MarkedValueStale");
      await expect(repo.getAUM()).to.be.revertedWithCustomError(bookKeeper, "MarkedValueStale");

      // But lastKnown methods should return cached values
      const [lastNAV] = await repo.getLastKnownNAV();
      const [lastAUM] = await repo.getLastKnownAUM();
      expect(lastNAV).to.be.eq(expectedNAV);
      expect(lastAUM).to.be.eq(expectedAUM);
    });

    it("should prevent zero AUM with existing token supply", async () => {
      const amount = toBN("100", 6);
      await approveAndDeposit(alice, amount, true, 'USDC');

      expect(await repoToken.balanceOf(aliceAddress)).to.be.closeTo(toBN("100"), toBN("0.1"));
      expect(await repo.getAUM()).to.be.eq(toBN("100"));
      expect(await repoToken.totalSupply()).to.be.eq(toBN("100"));
      expect(await repo.getNAV()).to.be.eq(toBN("1"));

      // Move funds to create zero AUM scenario
      await repo.connect(controller).moveFundsToExecutor(amount);
      await bookKeeper.connect(controller).markValueOffChainSettled(true);
      expect(await repo.getAUM()).to.be.eq(0);

      // Should revert when trying to mark zero AUM with existing token supply
      await expect(
        bookKeeper.connect(controller).markValueOffChain18(0, 1000, toBN("1"))
      ).to.be.revertedWithCustomError(bookKeeper, "NonPositiveAUM");
    });
  });

  describe("Deposit cap", () => {
    it(`intiate deposit should fail if capReached`, async () => {
      const amount = toBN("400", 6);
      await approveAndDeposit(alice, amount, true, 'USDC');

      // Check alice received the correct amount of repository tokens
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await alice.getAddress()
        )
      ).to.be.closeTo(toBN("400"), toBN("0.1"));

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).
        setTotalValueCap18(toBN("1000"))

      await approveAndDeposit(alice, amount, false, 'USDC');

      await expect(hre.f.SC.repositoryContracts[0].repository
        .connect(alice).initiateDeposit(toBN("1000", 6), 0)).to.be.
        revertedWithCustomError(hre.f.SC.repositoryContracts[0].repository, "TotalValueCapReached");

      // Reset the cap to a high value so subsequent tests don't fail
      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).
        setTotalValueCap18(toBN("100000000"));
    });
  });

  describe("Seed repository with initial outside balance", () => {
    it(`should be able to seed`, async () => {
      //A hedgefund starting with $1000 AUM, 100 share @ NAV=10 off chain
      const finalAUM = toBN("1000")
      const finalTotalSupply = toBN("100")
      const finalNAV = toBN("10")
      expect(await hre.f.SC.repositoryContracts[0].repository.getAUM()).to.be.eq(0)
      expect(await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply()).to.be.eq(0)
      expect(await hre.f.SC.repositoryContracts[0].repository.getNAV()).to.be.eq(toBN("1"))

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainDeposit18(finalTotalSupply, toBN("1"), await hre.f.SC.repositoryContracts[0].controller.getAddress())

      await hre.f.SC.repositoryContracts[0].bookKeeper.connect(hre.f.SC.repositoryContracts[0].controller).
        markValueOffChain18(finalAUM, 1000, toBN("10"))
      
      await hre.f.SC.repositoryContracts[0].bookKeeper.connect(hre.f.SC.repositoryContracts[0].controller).
        markValueOffChainSettled(true)
      expect(await hre.f.SC.repositoryContracts[0].repository.getNAV()).to.be.eq(finalNAV)
      expect(await hre.f.SC.repositoryContracts[0].repository.getAUM()).to.be.eq(finalAUM)
      expect(await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply()).to.be.eq(finalTotalSupply)
    });
  });

  describe("DirectInputBookKeeper Edge Cases & Overflow Tests", () => {
    it("should handle large value for valueOffChain", async () => {
      const largeValue = toBN("1000000000"); // Large but not max

      // Should not overflow when setting large value
      await bookKeeper.connect(controller).markValueOffChain18(
        largeValue,
        1000, // validFor in seconds
        toBN("1") // expectedNAV
      );

      expect(await bookKeeper.valueOffChain18()).to.equal(largeValue);
    });

    it("should handle zero value for valueOffChain", async () => {
      await bookKeeper.connect(controller).markValueOffChain18(
        0,
        1000,
        toBN("1")
      );

      expect(await bookKeeper.valueOffChain18()).to.equal(0);
    });

    it("should update valueOffChain multiple times in same block", async () => {
      const value1 = toBN("1000");
      const value2 = toBN("2000");

      await bookKeeper.connect(controller).markValueOffChain18(value1, 1000, toBN("1"));
      expect(await bookKeeper.valueOffChain18()).to.equal(value1);

      await bookKeeper.connect(controller).markValueOffChain18(value2, 1000, toBN("1"));
      expect(await bookKeeper.valueOffChain18()).to.equal(value2);
    });

    it("should handle very short validFor duration (1 second)", async () => {
      const value = toBN("1000");

      await bookKeeper.connect(controller).markValueOffChain18(value, 1, toBN("1"));

      // Fast forward 2 seconds
      await fastForward(2);

      // Should be stale now (MarkedValueStale error)
      await expect(
        bookKeeper.getNAV()
      ).to.be.revertedWithCustomError(bookKeeper, "MarkedValueStale");
    });

    it("should handle validFor duration and not be stale", async () => {
      const value = toBN("1000");
      const validFor = 1000; // 1000 seconds

      await bookKeeper.connect(controller).markValueOffChain18(value, validFor, toBN("1"));

      // Should be valid immediately
      const [nav] = await bookKeeper.getNAV();
      expect(nav).to.be.gt(0);

      // Verify valueOffChain was set
      expect(await bookKeeper.valueOffChain18()).to.equal(value);
    });

    it("should mark value as settled", async () => {
      const value = toBN("1000");

      await bookKeeper.connect(controller).markValueOffChain18(value, 1000, toBN("1"));

      // Mark as settled
      await bookKeeper.connect(controller).markValueOffChainSettled(true);

      expect(await bookKeeper.valueOffChainSettled()).to.be.true;
    });

    it("should handle settlement state transitions correctly", async () => {
      const value = toBN("1000");

      // Initially not settled
      await bookKeeper.connect(controller).markValueOffChain18(value, 1000, toBN("1"));

      // Mark as settled
      await bookKeeper.connect(controller).markValueOffChainSettled(true);
      expect(await bookKeeper.valueOffChainSettled()).to.be.true;

      // Mark as unsettled
      await bookKeeper.connect(controller).markValueOffChainSettled(false);
      expect(await bookKeeper.valueOffChainSettled()).to.be.false;
    });

    it("should verify controller can mark as settled", async () => {
      const value = toBN("1000");
      await bookKeeper.connect(controller).markValueOffChain18(value, 1000, toBN("1"));

      // Controller can mark as settled
      await bookKeeper.connect(controller).markValueOffChainSettled(true);
      expect(await bookKeeper.valueOffChainSettled()).to.be.true;

      // Controller can mark as unsettled
      await bookKeeper.connect(controller).markValueOffChainSettled(false);
      expect(await bookKeeper.valueOffChainSettled()).to.be.false;
    });

    it("should handle AUM calculation with large valueOffChain", async () => {
      const largeValue = toBN("1000000"); // Large value

      await bookKeeper.connect(controller).markValueOffChain18(largeValue, 1000, toBN("1"));
      await bookKeeper.connect(controller).markValueOffChainSettled(true);

      // Should handle large values without overflow
      const [aum] = await bookKeeper.getAUM();
      expect(aum).to.be.gte(largeValue);
    });

    it("should revert when NAV expectation fails with small margin", async () => {
      const value = toBN("1000");
      const wrongNav = toBN("100"); // 10x different from actual NAV

      // Set very small margin
      await bookKeeper.connect(controller).setAcceptableMarginOfError(toBN("0.01", 18)); // 1%

      await expect(
        bookKeeper.connect(controller).markValueOffChain18(value, 1000, wrongNav)
      ).to.be.revertedWithCustomError(bookKeeper, "InconsistentNAV");
    });

    it("should accept NAV with sufficient margin", async () => {
      const value = toBN("1000");

      // Set large margin
      await bookKeeper.connect(controller).setAcceptableMarginOfError(toBN("0.5", 18)); // 50%

      // Get actual NAV first
      const [actualNav] = await bookKeeper.getNAV();

      // Should accept NAV within margin
      await bookKeeper.connect(controller).markValueOffChain18(value, 1000, actualNav);
      expect(await bookKeeper.valueOffChain18()).to.equal(value);
    });

    it("should handle staleness check edge case at exact boundary", async () => {
      const value = toBN("1000");
      const validFor = 100; // 100 seconds

      await bookKeeper.connect(controller).markValueOffChain18(value, validFor, toBN("1"));

      // Fast forward exactly 100 seconds
      await fastForward(100);

      // Should still be valid at exact boundary
      const [nav] = await bookKeeper.getNAV();
      expect(nav).to.be.gt(0);
    });

    it("should fail just past staleness boundary", async () => {
      const value = toBN("1000");
      const validFor = 100;

      await bookKeeper.connect(controller).markValueOffChain18(value, validFor, toBN("1"));

      // Fast forward 101 seconds (1 past boundary)
      await fastForward(101);

      // Should be stale
      await expect(
        bookKeeper.getNAV()
      ).to.be.revertedWithCustomError(bookKeeper, "MarkedValueStale");
    });
  });
});

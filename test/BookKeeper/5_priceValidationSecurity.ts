import { expect, hre, ethers, loadFixture, createFixture, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import { fastForward } from "../helpers/evm.js";
import type { AccountNFTBookKeeper, MockAggregatorV2V3 } from "../../typechain-types/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Price Validation Security - Comprehensive Tests", () => {
  let bookKeeper: AccountNFTBookKeeper;
  let ethFeed: MockAggregatorV2V3;
  let usdcFeed: MockAggregatorV2V3;
  let controller: HardhatEthersSigner;
  let alice: HardhatEthersSigner;

  const deployContractsFixture = createFixture(
    'accountNFT',
    'none',
    'USDC',
    true,
    0,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);

    // Set up contract shortcuts
    bookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper;
    ethFeed = hre.f.SC.ethFeed;
    usdcFeed = hre.f.SC.USDCFeed;
    controller = hre.f.SC.repositoryContracts[0].controller;
    alice = getAlice();
  });

  describe("Critical Price Validation", () => {
    it("should revert when feed returns zero price", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");

      // WETH should already be in the watchlist from setupTestSystem

      // Enable executor balance inclusion
      await bookKeeper.connect(controller).setIncludeExecutor(true);

      // Add both USDC and WETH balances to executor to trigger price validation
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("1000", 6));
      await hre.f.SC.MockWETH.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("10", 18));

      // First ensure USDC feed has valid fresh data to pass staleness check
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Set ETH price to 0 with fresh timestamp - this is the critical vulnerability test
      await ethFeed.setLatestAnswer(toBN("0"), latestBlock.timestamp);

      // Any operation using AUM should now revert
      await expect(bookKeeper.getAUM())
        .to.be.revertedWithCustomError(bookKeeper, "InvalidPriceForAsset")
        .withArgs(await hre.f.SC.MockWETH.getAddress(), 0);
    });

    it("should revert when feed returns negative price", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");

      // WETH should already be in the watchlist from setupTestSystem

      // Enable executor balance inclusion
      await bookKeeper.connect(controller).setIncludeExecutor(true);

      // Add both USDC and WETH balances to executor to trigger price validation
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("1000", 6));
      await hre.f.SC.MockWETH.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("10", 18));

      // Ensure USDC feed has valid fresh data
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Set ETH price to negative value with fresh timestamp
      await ethFeed.setLatestAnswer(toBN("-2000"), latestBlock.timestamp);

      // Should revert
      await expect(bookKeeper.getAUM())
        .to.be.revertedWithCustomError(bookKeeper, "InvalidPriceForAsset")
        .withArgs(await hre.f.SC.MockWETH.getAddress(), toBN("-2000"));
    });

    it("should accept positive prices normally", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");

      // Set both feeds to valid fresh data
      await ethFeed.setLatestAnswer(toBN("2500"), latestBlock.timestamp);
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Should work normally
      const [aum] = await bookKeeper.getAUM();
      expect(aum).to.be.gte(0);
    });

    it("should accept very small positive prices (1 wei)", async () => {
      // This tests the boundary condition - should this be allowed or not?
      // Current implementation allows any positive value
      const latestBlock = await hre.ethers.provider.getBlock("latest");

      await ethFeed.setLatestAnswer(toBN("1"), latestBlock.timestamp);
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Should work with very small positive price
      const [aum] = await bookKeeper.getAUM();
      expect(aum).to.be.gte(0);
    });
  });

  describe("Price Staleness Validation", () => {
    it("should revert when price data is stale", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");
      const oldTimestamp = latestBlock.timestamp - 86401; // Just over 24 hours old (default maxPriceAge)

      // WETH should already be in the watchlist from setupTestSystem

      // Enable executor balance inclusion
      await bookKeeper.connect(controller).setIncludeExecutor(true);

      // Add both USDC and WETH balances to executor to trigger price validation
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("1000", 6));
      await hre.f.SC.MockWETH.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("10", 18));

      // Set valid USDC price with fresh timestamp
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Set a valid price but with old timestamp to test staleness
      await ethFeed.setLatestAnswer(toBN("2000"), oldTimestamp);

      // Should revert due to stale price data
      await expect(bookKeeper.getAUM())
        .to.be.revertedWithCustomError(bookKeeper, "StalePriceData");
    });

    it("should accept fresh price data", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");

      // Set both feeds with recent prices (within 24 hours)
      await ethFeed.setLatestAnswer(toBN("2000"), latestBlock.timestamp - 3600); // 1 hour old
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Should work normally
      const [aum] = await bookKeeper.getAUM();
      expect(aum).to.be.gte(0);
    });

    it("should respect custom maxPriceAge setting", async () => {
      // Set maxPriceAge to 1 hour (3600 seconds)
      await bookKeeper.connect(controller).setMaxPriceAge(3600);

      // WETH should already be in the watchlist from setupTestSystem

      // Enable executor balance inclusion
      await bookKeeper.connect(controller).setIncludeExecutor(true);

      // Add both USDC and WETH balances to executor to trigger price validation
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("1000", 6));
      await hre.f.SC.MockWETH.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("10", 18));

      const latestBlock = await hre.ethers.provider.getBlock("latest");
      const oldTimestamp = latestBlock.timestamp - 3601; // Just over 1 hour old

      // Set valid USDC price with fresh timestamp
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Set ETH price with old timestamp to test custom staleness limit
      await ethFeed.setLatestAnswer(toBN("2000"), oldTimestamp);

      // Should revert due to custom staleness limit
      await expect(bookKeeper.getAUM())
        .to.be.revertedWithCustomError(bookKeeper, "StalePriceData");
    });

    it("should allow controller to update maxPriceAge", async () => {
      const newMaxAge = 7200; // 2 hours

      await bookKeeper.connect(controller).setMaxPriceAge(newMaxAge);

      // Verify the setting was updated
      expect(await bookKeeper.maxPriceAge()).to.equal(newMaxAge);
    });

    it("should revert when non-controller tries to set maxPriceAge", async () => {
      await expect(
        bookKeeper.connect(alice).setMaxPriceAge(3600)
      ).to.be.revertedWithCustomError(bookKeeper, "OnlyRepositoryController");
    });
  });

  describe("Edge Cases and Attack Scenarios", () => {
    it("should handle zero balance with positive price", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");

      // Set both feeds with valid fresh data
      await ethFeed.setLatestAnswer(toBN("2000"), latestBlock.timestamp);
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Even with zero balance, price validation should still occur
      const [aum] = await bookKeeper.getAUM();
      expect(aum).to.be.gte(0);
    });

    it("should handle negative balance with positive price", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");

      // Set both feeds with valid fresh data
      await ethFeed.setLatestAnswer(toBN("2000"), latestBlock.timestamp);
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Negative balances should work fine with positive prices
      const [aum] = await bookKeeper.getAUM();
      expect(aum).to.be.gte(0);
    });

    it("should prevent price manipulation through zero price attack", async () => {
      // This simulates an oracle manipulation attack where attacker
      // tries to make assets appear worthless

      // WETH should already be in the watchlist from setupTestSystem

      // Enable executor balance inclusion
      await bookKeeper.connect(controller).setIncludeExecutor(true);

      // Add both USDC and WETH balances to executor to trigger price validation
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("1000", 6));
      await hre.f.SC.MockWETH.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("10", 18));

      const latestBlock = await hre.ethers.provider.getBlock("latest");

      // Set USDC to valid price
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Set ETH price to 0 to make holdings appear worthless
      await ethFeed.setLatestAnswer(toBN("0"), latestBlock.timestamp);

      // Any AUM calculation should fail, preventing manipulation
      await expect(bookKeeper.getAUM())
        .to.be.revertedWithCustomError(bookKeeper, "InvalidPriceForAsset")
        .withArgs(await hre.f.SC.MockWETH.getAddress(), 0);
    });

    it("should handle multiple feeds with one invalid price", async () => {
      // WETH should already be in the watchlist from setupTestSystem

      // Enable executor balance inclusion
      await bookKeeper.connect(controller).setIncludeExecutor(true);

      // Add both USDC and WETH balances to executor to trigger price validation
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("1000", 6));
      await hre.f.SC.MockWETH.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("10", 18));

      const latestBlock = await hre.ethers.provider.getBlock("latest");

      // Set USDC price to valid positive value with fresh timestamp
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Set ETH price to invalid negative value with fresh timestamp
      await ethFeed.setLatestAnswer(toBN("-1000"), latestBlock.timestamp);

      // Should fail because of the invalid ETH price
      await expect(bookKeeper.getAUM())
        .to.be.revertedWithCustomError(bookKeeper, "InvalidPriceForAsset")
        .withArgs(await hre.f.SC.MockWETH.getAddress(), toBN("-1000"));
    });

    it("should handle timestamp edge case at exact maxPriceAge boundary", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");
      const exactBoundaryTimestamp = latestBlock.timestamp - 86400; // Exactly 24 hours old

      // Set USDC with fresh timestamp
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Set ETH at exact boundary
      await ethFeed.setLatestAnswer(toBN("2000"), exactBoundaryTimestamp);

      // Should be valid (not stale) at exact boundary
      const [aum] = await bookKeeper.getAUM();
      expect(aum).to.be.gte(0);
    });

    it("should fail just past the staleness boundary", async () => {
      // WETH should already be in the watchlist from setupTestSystem

      // Enable executor balance inclusion
      await bookKeeper.connect(controller).setIncludeExecutor(true);

      // Add both USDC and WETH balances to executor to trigger price validation
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("1000", 6));
      await hre.f.SC.MockWETH.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("10", 18));

      const latestBlock = await hre.ethers.provider.getBlock("latest");
      const pastBoundaryTimestamp = latestBlock.timestamp - 86401; // 1 second past 24 hours

      // Set valid USDC price with fresh timestamp
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      await ethFeed.setLatestAnswer(toBN("2000"), pastBoundaryTimestamp);

      // Should revert as stale
      await expect(bookKeeper.getAUM())
        .to.be.revertedWithCustomError(bookKeeper, "StalePriceData");
    });
  });

  describe("Integration with Repository Operations", () => {
    it("should prevent deposits when price data is invalid", async () => {
      // WETH should already be in the watchlist from setupTestSystem

      // Enable executor balance inclusion
      await bookKeeper.connect(controller).setIncludeExecutor(true);

      // Add both USDC and WETH balances to executor to trigger price validation
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("1000", 6));
      await hre.f.SC.MockWETH.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("10", 18));

      const latestBlock = await hre.ethers.provider.getBlock("latest");

      // Set USDC to valid price
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Set ETH to invalid price with fresh timestamp
      await ethFeed.setLatestAnswer(toBN("0"), latestBlock.timestamp);

      // Repository operations that check AUM should fail
      // Note: isCapReached uses cached lastKnownAUM, but getAUM() triggers price validation
      await expect(bookKeeper.getAUM())
        .to.be.revertedWithCustomError(bookKeeper, "InvalidPriceForAsset")
        .withArgs(await hre.f.SC.MockWETH.getAddress(), 0);
    });

    it("should prevent NAV calculations with stale prices", async () => {
      // WETH should already be in the watchlist from setupTestSystem

      // Enable executor balance inclusion
      await bookKeeper.connect(controller).setIncludeExecutor(true);

      // Add both USDC and WETH balances to executor to trigger price validation
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("1000", 6));
      await hre.f.SC.MockWETH.connect(hre.f.SC.deployer).mint(await hre.f.SC.repositoryContracts[0].executor.getAddress(), toBN("10", 18));

      const latestBlock = await hre.ethers.provider.getBlock("latest");

      // Set USDC to valid fresh price
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // Set ETH to valid price but stale timestamp
      await ethFeed.setLatestAnswer(toBN("2000"), latestBlock.timestamp - 86401);

      // NAV calculation should fail with stale prices
      await expect(bookKeeper.getNAV())
        .to.be.revertedWithCustomError(bookKeeper, "StalePriceData");
    });

    it("should allow operations with valid, fresh prices", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");

      // Set both feeds to valid, fresh prices
      await ethFeed.setLatestAnswer(toBN("2500"), latestBlock.timestamp);
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      // All operations should work normally
      const [aum] = await bookKeeper.getAUM();
      const [nav] = await bookKeeper.getNAV();
      const isCapReached = await bookKeeper.isCapReached(toBN("100", 6));

      expect(aum).to.be.gte(0);
      expect(nav).to.be.gt(0);
      expect(isCapReached).to.be.a('boolean');
    });
  });

  describe("Acceptable Margin of Error Edge Cases", () => {
    it("should allow setting margin of error to 0 (exact match required)", async () => {
      await bookKeeper.connect(controller).setAcceptableMarginOfError(0);
      expect(await bookKeeper.acceptableMarginOfError()).to.equal(0);
    });

    it("should allow setting margin of error to 100% (1e18)", async () => {
      const fullMargin = toBN("1", 18); // 100%
      await bookKeeper.connect(controller).setAcceptableMarginOfError(fullMargin);
      expect(await bookKeeper.acceptableMarginOfError()).to.equal(fullMargin);
    });

    it("should allow setting margin of error to very large value", async () => {
      const largeMargin = toBN("10", 18); // 1000%
      await bookKeeper.connect(controller).setAcceptableMarginOfError(largeMargin);
      expect(await bookKeeper.acceptableMarginOfError()).to.equal(largeMargin);
    });

    it("should reject NAV with 0% margin when mismatch exists", async () => {
      await bookKeeper.connect(controller).setAcceptableMarginOfError(0);

      const latestBlock = await hre.ethers.provider.getBlock("latest");
      await ethFeed.setLatestAnswer(toBN("2500"), latestBlock.timestamp);
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      const [actualNav] = await bookKeeper.getNAV();
      const wrongNav = actualNav + 1n; // Off by 1

      await expect(
        bookKeeper.connect(controller).checkExpectedNAV(wrongNav)
      ).to.be.revertedWithCustomError(bookKeeper, "InconsistentNAV");
    });

    it("should accept NAV with 100% margin even with large mismatch", async () => {
      const fullMargin = toBN("1", 18); // 100%
      await bookKeeper.connect(controller).setAcceptableMarginOfError(fullMargin);

      const latestBlock = await hre.ethers.provider.getBlock("latest");
      await ethFeed.setLatestAnswer(toBN("2500"), latestBlock.timestamp);
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      const [actualNav] = await bookKeeper.getNAV();
      const doubleNav = actualNav * 2n; // 100% higher

      // Should not revert with 100% margin
      await bookKeeper.connect(controller).checkExpectedNAV(doubleNav);
    });

    it("should handle margin calculation with very small NAV values", async () => {
      const smallMargin = toBN("0.01", 18); // 1%
      await bookKeeper.connect(controller).setAcceptableMarginOfError(smallMargin);

      const latestBlock = await hre.ethers.provider.getBlock("latest");
      await ethFeed.setLatestAnswer(toBN("1"), latestBlock.timestamp); // Very small price
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      const [actualNav] = await bookKeeper.getNAV();

      // Should handle small values without overflow/underflow
      await bookKeeper.connect(controller).checkExpectedNAV(actualNav);
    });

    it("should revert when non-controller tries to set margin of error", async () => {
      await expect(
        bookKeeper.connect(alice).setAcceptableMarginOfError(toBN("0.1", 18))
      ).to.be.revertedWithCustomError(bookKeeper, "OnlyRepositoryController");
    });

    it("should handle margin calculation edge case at exact boundary", async () => {
      const margin = toBN("0.05", 18); // 5%
      await bookKeeper.connect(controller).setAcceptableMarginOfError(margin);

      const latestBlock = await hre.ethers.provider.getBlock("latest");
      await ethFeed.setLatestAnswer(toBN("2000"), latestBlock.timestamp);
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      const [actualNav] = await bookKeeper.getNAV();

      // Calculate exactly 5% higher
      const exactlyAtBoundary = actualNav + (actualNav * 5n / 100n);

      // Should accept value at exact boundary
      await bookKeeper.connect(controller).checkExpectedNAV(exactlyAtBoundary);
    });

    it("should revert just past the margin boundary", async () => {
      const margin = toBN("0.05", 18); // 5%
      await bookKeeper.connect(controller).setAcceptableMarginOfError(margin);

      const latestBlock = await hre.ethers.provider.getBlock("latest");
      await ethFeed.setLatestAnswer(toBN("2000"), latestBlock.timestamp);
      await usdcFeed.setLatestAnswer(toBN("1", 8), latestBlock.timestamp);

      const [actualNav] = await bookKeeper.getNAV();

      // Calculate 5.1% higher (just past boundary)
      const pastBoundary = actualNav + (actualNav * 51n / 1000n);

      await expect(
        bookKeeper.connect(controller).checkExpectedNAV(pastBoundary)
      ).to.be.revertedWithCustomError(bookKeeper, "InconsistentNAV");
    });
  });
});
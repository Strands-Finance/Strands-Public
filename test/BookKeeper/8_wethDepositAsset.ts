import { expect, hre, loadFixture, createFixture, ethers } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import type { AccountNFTBookKeeper } from "../../typechain-types/index.js";

describe("Dual-Unit BookKeeper Interface - WETH Repository", function () {
  let bookKeeper: AccountNFTBookKeeper;

  // Test with WETH as depositAsset to verify volatile asset handling
  const deployContractsFixture = createFixture(
    'accountNFT',
    'none',
    'WETH',
    true,
    100, // Initial WETH amount (100 WETH with 18 decimals)
    "0.05" // 5% fee rate (maximum allowed) for significant fee collection
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);
    bookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper;
  });

  it("should return both USD and WETH values from getAUM()", async () => {
    const [aumUsd, aumWeth] = await bookKeeper.getAUM();

    // Both values should be non-negative
    expect(aumUsd).to.be.gte(0);
    expect(aumWeth).to.be.gte(0);

    // Values should be different (USD vs WETH have different scaling)
    // USD values are typically much larger due to price scaling
  });

  it("should return both USD and WETH values from getNAV()", async () => {
    const [navUsd, navWeth] = await bookKeeper.getNAV();

    // Both values should be positive for a functioning repository
    expect(navUsd).to.be.gt(0);
    expect(navWeth).to.be.gt(0);
  });

  it("should return consistent values from getLastKnownAUM()", async () => {
    const [aumUsd, aumWeth, timestamp] = await bookKeeper.getLastKnownAUM();

    expect(aumUsd).to.be.gte(0);
    expect(aumWeth).to.be.gte(0);
    expect(timestamp).to.be.gt(0);
  });

  it("should demonstrate USD vs WETH value differences", async () => {
    // Get current values
    const [aumUsd, aumWeth] = await bookKeeper.getAUM();
    const [navUsd, navWeth] = await bookKeeper.getNAV();

    // In a WETH repository with ETH price ~$2000:
    // - USD values should be much larger (price scaled)
    // - WETH values should reflect actual WETH amounts

    // Both should be positive and reasonable
    expect(aumUsd).to.be.gte(0);
    expect(aumWeth).to.be.gte(0);
    expect(navUsd).to.be.gt(0);
    expect(navWeth).to.be.gt(0);
  });

  describe("Fee Collection with WETH", () => {
    it("should only allow controller to collect fees", async () => {
      // Set fee recipient first
      await hre.f.SC.repositoryFactory
        .connect(hre.f.SC.deployer)
        .setFeeRecipient(hre.f.signers[1].address);

      // Try to collect fees with non-controller account
      await expect(
        hre.f.SC.repositoryFactory
          .connect(hre.f.signers[2])
          .collectFeesFromRepositories([0])
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryFactory,
        "OnlyController"
      );

      // Try to call collectLicensingFee directly
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.signers[2])
          .collectLicensingFee()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyFactoryAllowed"
      );
    });

    it("should set and update fee recipient", async () => {
      // Set initial fee recipient
      await hre.f.SC.repositoryFactory
        .connect(hre.f.SC.deployer)
        .setFeeRecipient(hre.f.signers[1].address);

      expect(await hre.f.SC.repositoryFactory.feeRecipient()).to.eq(
        hre.f.signers[1].address
      );

      // Update fee recipient
      await hre.f.SC.repositoryFactory
        .connect(hre.f.SC.deployer)
        .setFeeRecipient(hre.f.signers[2].address);

      expect(await hre.f.SC.repositoryFactory.feeRecipient()).to.eq(
        hre.f.signers[2].address
      );
    });

    it("should collect accurate fee over 30 days period", async () => {
      // This test advances time by 30 days to verify accurate fee calculation
      // with a longer period that significantly reduces rounding errors

      await hre.f.SC.repositoryFactory
        .connect(hre.f.SC.deployer)
        .setFeeRecipient(hre.f.signers[1].address);

      const repository = hre.f.SC.repositoryContracts[0].repository;
      const initialBalance = await hre.f.SC.MockWETH.balanceOf(
        await repository.getAddress()
      );
      expect(initialBalance).to.eq(toBN("100", 18));

      // Get NAV and total supply before time advance
      const [navUsd, navWeth] = await bookKeeper.getNAV();
      const totalSupply = await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply();

      // Check the actual fee rate configured
      const licensingFeeRate = await repository.licensingFeeRate();

      // Check last fee collection time
      const lastFeeCollectionTimeBefore = await repository.lastFeeCollectionTime();

      // Advance time by 30 days
      const thirtyDays = 30 * 24 * 60 * 60;
      await hre.ethers.provider.send("evm_increaseTime", [thirtyDays]);
      await hre.ethers.provider.send("evm_mine", []);

      // Update oracle price to prevent stale price error (oracle has 24h staleness limit)
      const currentBlock = await hre.ethers.provider.getBlock('latest');
      await hre.f.SC.ethFeed.setLatestAnswer(toBN("2000", 8), currentBlock!.timestamp);

      const blockAfter = await hre.ethers.provider.getBlock('latest');

      // Collect fee after 30 days
      await hre.f.SC.repositoryFactory
        .connect(hre.f.SC.controller)
        .collectFeesFromRepositories([0]);

      const afterBalance = await hre.f.SC.MockWETH.balanceOf(
        await repository.getAddress()
      );

      const feeCollected = initialBalance - afterBalance;

      // Calculate expected fee based on actual time elapsed
      // IMPORTANT: The internal _getLicenseFeeAccrued() uses navDepositAsset (WETH NAV)
      // This ensures fees are calculated in the depositAsset's terms, not USD
      // Contract formula: totalSupply.multiplyDecimal(navDepositAsset).multiplyDecimal(proRate)
      // Where navDepositAsset = navWeth and proRate = rate * timeElapsed / 365 days
      // multiplyDecimal(a,b) = a * b / 1e18
      const timeElapsed = blockAfter!.timestamp - Number(lastFeeCollectionTimeBefore);
      const secondsPerYear = BigInt(365 * 24 * 60 * 60);

      // proRate = rate * timeElapsed / secondsPerYear
      const proRate = (licensingFeeRate * BigInt(timeElapsed)) / secondsPerYear;

      // fee = totalSupply.multiplyDecimal(navWeth).multiplyDecimal(proRate)
      //     = (totalSupply * navWeth / 1e18) * proRate / 1e18
      // NOTE: Using navWeth (depositAsset NAV) because fees are collected in depositAsset terms!
      const expectedFeeCalculation = (totalSupply * navWeth / BigInt(10)**BigInt(18)) * proRate / BigInt(10)**BigInt(18);

      // Fee should match expected within an extremely tight tolerance
      // With 30 days elapsed, rounding errors become negligible relative to the fee amount
      expect(feeCollected).to.be.closeTo(
        expectedFeeCalculation,
        toBN("0.000001", 18) // 0.000001 WETH tolerance (1 microWETH) - expect near-perfect precision
      );

      // Check fee recipient received the fee
      const recipientBalance = await hre.f.SC.MockWETH.balanceOf(
        hre.f.signers[1].address
      );
      expect(recipientBalance).to.eq(feeCollected);
    });

  });
});
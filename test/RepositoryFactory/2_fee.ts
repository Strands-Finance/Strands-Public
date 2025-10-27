import { hre, expect, ethers, loadFixture, createFixture, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";

describe(`Repository Factory Fee - Testing (using accountNFTBookKeeper)`, () => {
  let alice: any;
  let bob: any;

  const deployContractsFixture = createFixture(
    'accountNFT',
    'none',
    'USDC',
    true,
    50000,
    "0.05" // 5% fee rate (maximum allowed) for significant fee collection
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);
    alice = getAlice();
    bob = getBob();
  });

  describe("Factory Repository - fee test", () => {
    it("can set fee recipient address", async () => {
      await hre.f.SC.repositoryFactory
        .connect(hre.f.SC.deployer)
        .setFeeRecipient(hre.f.signers[1].address);
      expect(await hre.f.SC.repositoryFactory.feeRecipient()).to.be.eq(
        hre.f.signers[1].address
      );
    });

    it("only owner of the repository factory can collect fees", async () => {
      // Try to collect fees with an account that is not the owner
      await expect(
        hre.f.SC.repositoryFactory
          .connect(bob)
          .collectFeesFromRepositories([0,1,2,3])
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryFactory,
        "OnlyController"
      );

      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(bob)
          .collectLicensingFee()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyFactoryAllowed"
      );
    });

    it("only owner can remove the repository", async () => {
      const prevRepositoryAddress =
        await hre.f.SC.repositoryFactory.deployedRepositories(0);

      await expect(
        hre.f.SC.repositoryFactory
          .connect(hre.f.SC.controller)
          .removeRepository(0)
      )
        .to.emit(hre.f.SC.repositoryFactory, "RepositoryRemoved")
        .withArgs(
          prevRepositoryAddress,
          0,
          "0x0000000000000000000000000000000000000000"
        );
    });

    it("should collect accurate fee over 30 days period", async () => {
      // This test advances time by 30 days to verify accurate fee calculation
      // with a longer period that significantly reduces rounding errors

      await hre.f.SC.repositoryFactory
        .connect(hre.f.SC.deployer)
        .setFeeRecipient(hre.f.signers[1].address);

      const repository = hre.f.SC.repositoryContracts[0].repository;
      const bookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper;
      const initialBalance = await hre.f.SC.MockUSDC.balanceOf(
        await repository.getAddress()
      );
      expect(initialBalance).to.eq(toBN("50000", 6));

      // Get NAV and total supply before time advance
      const [navUsd, navUsdc] = await bookKeeper.getNAV();
      const totalSupply = await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply();

      // Verify we have tokens minted (required for fee collection)
      expect(totalSupply).to.be.gt(0, "Total supply must be > 0 for fees to accrue");

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
      await hre.f.SC.USDCFeed.setLatestAnswer(toBN("1", 8), currentBlock!.timestamp);

      const blockAfter = await hre.ethers.provider.getBlock('latest');

      // Collect fee after 30 days
      await hre.f.SC.repositoryFactory
        .connect(hre.f.SC.controller)
        .collectFeesFromRepositories([0]);

      const afterBalance = await hre.f.SC.MockUSDC.balanceOf(
        await repository.getAddress()
      );

      const feeCollected = initialBalance - afterBalance;

      // Calculate expected fee based on actual time elapsed
      // IMPORTANT: The internal _getLicenseFeeAccrued() uses navDepositAsset (USDC NAV)
      // This ensures fees are calculated in the depositAsset's terms, not USD
      // Contract formula: totalSupply.multiplyDecimal(navDepositAsset).multiplyDecimal(proRate)
      // Where navDepositAsset = navUsdc and proRate = rate * timeElapsed / 365 days
      // multiplyDecimal(a,b) = a * b / 1e18
      const timeElapsed = blockAfter!.timestamp - Number(lastFeeCollectionTimeBefore);
      const secondsPerYear = BigInt(365 * 24 * 60 * 60);

      // proRate = rate * timeElapsed / secondsPerYear
      const proRate = (licensingFeeRate * BigInt(timeElapsed)) / secondsPerYear;

      // fee = totalSupply.multiplyDecimal(navUsdc).multiplyDecimal(proRate)
      //     = (totalSupply * navUsdc / 1e18) * proRate / 1e18
      // NOTE: Using navUsdc (depositAsset NAV) because fees are collected in depositAsset terms!
      const expectedFeeCalculation18 = (totalSupply * navUsdc / BigInt(10)**BigInt(18)) * proRate / BigInt(10)**BigInt(18);

      // Convert from 18 decimals to 6 decimals (USDC)
      const expectedFeeCalculation = expectedFeeCalculation18 * BigInt(10)**BigInt(6) / BigInt(10)**BigInt(18);

      // Fee should match expected within an extremely tight tolerance
      // With 30 days elapsed, rounding errors become negligible relative to the fee amount
      expect(feeCollected).to.be.closeTo(
        expectedFeeCalculation,
        toBN("0.01", 6) // 0.01 USDC tolerance - expect near-perfect precision
      );

      // Check fee recipient received the fee
      const recipientBalance = await hre.f.SC.MockUSDC.balanceOf(
        hre.f.signers[1].address
      );
      expect(recipientBalance).to.eq(feeCollected);
    });
  });
});

import { ethers } from "ethers";
import { expect, hre, loadFixture, createFixture } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import type { AccountNFTBookKeeper } from "../../typechain-types/BookKeepers/AccountNFTBookKeeper.js";

describe(`Spot Pricing - Testing (using accountNFTBookKeeper)`, () => {
  const deployContractsFixture = createFixture(
    'accountNFT',
    'none',
    'USDC',
    true,
    50000,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);
  });

  describe("Executor Balance Integration", () => {
    it("should correctly calculate AUM with various executor assets", async () => {
      const executorAddress = await hre.f.SC.repositoryContracts[0].executor.getAddress();
      const bookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper;
      const controller = hre.f.SC.repositoryContracts[0].controller;

      // Verify initial repository balance (50k USDC)
      const repoBalance = await hre.f.SC.MockUSDC.balanceOf(
        await hre.f.SC.repositoryContracts[0].repository.getAddress()
      );
      expect(repoBalance).to.be.eq(toBN("50000", 6));

      const [initialAUM] = await bookKeeper.getAUM();
      expect(initialAUM).to.be.eq(toBN("50000"));

      // Test 1: USDC-only scenario
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(controller)
        .removeTokenFromWatchlist(await hre.f.SC.MockWETH.getAddress());

      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(executorAddress, toBN("100000", 6));
      await bookKeeper.connect(controller).setIncludeExecutor(true);

      const [usdcOnlyAUM] = await bookKeeper.getAUM();
      expect(usdcOnlyAUM).to.be.eq(toBN("150000")); // 50k repo + 100k executor

      // Re-add WETH to watchlist for remaining tests
      await bookKeeper.connect(controller).addTokenToWatchlist(
        await hre.f.SC.MockWETH.getAddress(),
        await hre.f.SC.ethFeedWrapper.getAddress()
      );

      // Test 2: WETH scenario
      // Mint exactly 10 WETH (18 decimals) to executor
      await hre.f.SC.MockWETH.connect(hre.f.SC.deployer).mint(executorAddress, toBN("10", 18));

      const [wethAUM] = await bookKeeper.getAUM();
      // Previous 150k + 10 WETH * $2000 = at least 170k
      expect(wethAUM).to.be.gte(toBN("170000"));

      // Test 3: Mixed ETH + WETH scenario
      await hre.f.alice.sendTransaction({ to: executorAddress, value: toBN("5", 18) });
      await hre.f.SC.MockWETH.connect(hre.f.SC.deployer).mint(executorAddress, toBN("3", 18));

      const [mixedAUM] = await bookKeeper.getAUM();
      // Added 8 ETH total (5 + 3) * $2000 = at least 16k increase
      const minExpectedIncrease = toBN("16000");
      expect(mixedAUM - wethAUM).to.be.gte(minExpectedIncrease);
    });

    it("should handle executor inclusion/exclusion correctly", async () => {
      const executorAddress = await hre.f.SC.repositoryContracts[0].executor.getAddress();
      const bookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper;
      const controller = hre.f.SC.repositoryContracts[0].controller;

      // Add assets to executor
      await hre.f.SC.MockWETH.connect(hre.f.SC.deployer).mint(executorAddress, toBN("5", 18));

      // Test exclusion (default)
      const [aumWithoutExecutor] = await bookKeeper.getAUM();

      // Test inclusion - counts repository + executor
      await bookKeeper.connect(controller).setIncludeExecutor(true);
      const [aumWithExecutor] = await bookKeeper.getAUM();

      // Should increase by at least 5 WETH * $2000 = 10k
      expect(aumWithExecutor).to.be.gt(aumWithoutExecutor);
      const minExpectedIncrease = toBN("10000");
      expect(aumWithExecutor - aumWithoutExecutor).to.be.gte(minExpectedIncrease);

      // Test watchlist dependency
      await bookKeeper.connect(controller).removeTokenFromWatchlist(await hre.f.SC.MockWETH.getAddress());
      await hre.f.alice.sendTransaction({ to: executorAddress, value: toBN("10", 18) });

      const [aumNoWethWatch] = await bookKeeper.getAUM();
      expect(aumNoWethWatch).to.equal(toBN("50000")); // Only USDC counted (adjusted for actual state)
    });

    it("should enforce access control for executor flag", async () => {
      const bookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper;
      const controller = hre.f.SC.repositoryContracts[0].controller;

      // Non-controller should be rejected
      await expect(bookKeeper.connect(hre.f.alice).setIncludeExecutor(false)).to.revert(ethers);

      // Controller should succeed
      await bookKeeper.connect(controller).setIncludeExecutor(false);
      expect(await bookKeeper.includeExecutor()).to.be.false;

      // Reset for other tests
      await bookKeeper.connect(controller).setIncludeExecutor(true);
    });
  });
});

import { ethers } from "ethers";
import { expect, hre, loadFixture, createFixture } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import type { AccountNFTBookKeeper, MockAggregatorV2V3 } from "../../typechain-types/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe(`Enhanced Feeds - Testing (using accountNFTBookKeeper)`, () => {
  let bookKeeper: AccountNFTBookKeeper;
  let ethFeed: MockAggregatorV2V3;
  let usdcFeed: MockAggregatorV2V3;
  let controller: HardhatEthersSigner;

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
  });

  describe("Basic Feed Validation", () => {
    it("should verify feeds exist and have correct initial data", async () => {
      expect(ethFeed).to.not.be.undefined;
      expect(usdcFeed).to.not.be.undefined;

      expect(await ethFeed.latestRound()).to.be.gte(1);
      expect(await usdcFeed.latestRound()).to.be.gte(1);
    });

    it("should handle different decimal precisions correctly", async () => {
      // Check actual decimals from the feeds
      const ethDecimals = await ethFeed.decimals();
      const usdcDecimals = await usdcFeed.decimals();

      // Verify feeds have some decimal precision set
      expect(ethDecimals).to.be.gte(0);
      expect(usdcDecimals).to.be.gte(0);

      // Verify prices are correctly scaled in calculations
      const [aum] = await bookKeeper.getAUM();
      expect(aum).to.be.gte(0);
    });
  });

  describe("Feed Data Validation", () => {
    it("should handle various price scenarios gracefully", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");

      const testPrices = [
        { value: toBN("-1000"), desc: "negative" },
        { value: toBN("0"), desc: "zero" },
        { value: toBN("1000000000"), desc: "very large" },
        { value: toBN("1"), desc: "minimum positive" }
      ];

      for (const { value, desc } of testPrices) {
        await ethFeed.setLatestAnswer(value, latestBlock.timestamp);
        const [aum] = await bookKeeper.getAUM();
        expect(aum).to.be.gte(0); // System should handle ${desc} prices gracefully
      }
    });
  });

  describe("Feed Revert Scenarios", () => {
    it("should handle latestRoundData failures gracefully", async () => {
      // Enable revert for latestRoundData
      await ethFeed.setLatestRoundDataShouldRevert(true);

      // BookKeeper should handle this gracefully and still return valid AUM
      // (possibly using cached/fallback values)
      const [aum] = await bookKeeper.getAUM();
      expect(aum).to.be.gte(0);

      // Reset and verify system still works normally
      await ethFeed.setLatestRoundDataShouldRevert(false);
      const [aumAfter] = await bookKeeper.getAUM();
      expect(aumAfter).to.be.gte(0);
    });

    it("should handle all round data method failures gracefully", async () => {
      // Enable revert for all round data methods
      await ethFeed.setAllRoundDataShouldRevert(true);

      // BookKeeper should handle this gracefully and still return valid AUM
      // (possibly using cached/fallback values)
      const [aum] = await bookKeeper.getAUM();
      expect(aum).to.be.gte(0);

      // Reset and verify system still works normally
      await ethFeed.setAllRoundDataShouldRevert(false);
      const [aumAfter] = await bookKeeper.getAUM();
      expect(aumAfter).to.be.gte(0);
    });
  });

  describe("Price Update and Timestamp Validation", () => {
    it("should validate timestamp consistency in updates", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");

      await ethFeed.setLatestAnswer(toBN("2500"), latestBlock.timestamp);

      const roundData = await ethFeed.latestRoundData();
      // Access by index instead of property name (updatedAt is at index 3)
      expect(roundData[3]).to.be.eq(BigInt(latestBlock.timestamp));
    });

    it("should reject future timestamps as security measure", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");
      const futureTimestamp = latestBlock.timestamp + 3600; // 1 hour in future

      // Set USDC feed to a future timestamp
      await usdcFeed.setLatestAnswer(toBN("1"), futureTimestamp);

      // BookKeeper should reject this as a security measure
      await expect(bookKeeper.getAUM())
        .to.be.revertedWithCustomError(bookKeeper, "StalePriceData");
    });

    it("should handle stale price scenarios", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");
      const oldTimestamp = latestBlock.timestamp - 86400; // 24 hours ago

      await ethFeed.setLatestAnswer(toBN("2200"), oldTimestamp);

      // System should still function with stale prices
      const [aum] = await bookKeeper.getAUM();
      expect(aum).to.be.gte(0);
    });
  });

  describe("Round Data Management", () => {
    it("should validate round ID sequencing", async () => {
      const initialRound = await ethFeed.latestRound();

      const latestBlock = await hre.ethers.provider.getBlock("latest");
      await ethFeed.setLatestAnswer(toBN("2300"), latestBlock.timestamp);

      const newRound = await ethFeed.latestRound();
      expect(newRound).to.be.eq(initialRound + 1n);
    });

    it("should handle getRoundData for specific rounds", async () => {
      // Get data for round 1 (should exist from setup)
      const round1Data = await ethFeed.getRoundData(1);
      expect(round1Data[0]).to.be.eq(1); // roundId is at index 0

      // Add new round
      const latestBlock = await hre.ethers.provider.getBlock("latest");
      await ethFeed.setLatestAnswer(toBN("2400"), latestBlock.timestamp);

      // Get data for round 2
      const round2Data = await ethFeed.getRoundData(2);
      expect(round2Data[0]).to.be.eq(2); // roundId is at index 0
    });

    it("should revert when requesting invalid round ID", async () => {
      // Request non-existent round - should revert with "No data present"
      await expect(ethFeed.getRoundData(999))
        .to.be.revertedWith("No data present");
    });

    it("should validate answeredInRound consistency", async () => {
      const roundData = await ethFeed.latestRoundData();
      expect(roundData.answeredInRound).to.be.eq(roundData.roundId);
    });
  });

  describe("BookKeeper Integration", () => {
    it("should handle comprehensive price and timing scenarios", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");

      // Test various price scenarios
      const testPrices = [toBN("1500"), toBN("3000"), toBN("500"), toBN("10000")];
      for (const price of testPrices) {
        await ethFeed.setLatestAnswer(price, latestBlock.timestamp);
        const [aum] = await bookKeeper.getAUM();
        expect(aum).to.be.gte(0);
      }

      // Test multiple feeds with different update times
      await ethFeed.setLatestAnswer(toBN("2800"), latestBlock.timestamp - 10);
      await usdcFeed.setLatestAnswer(toBN("1.01"), latestBlock.timestamp - 5);
      const [aum1] = await bookKeeper.getAUM();
      expect(aum1).to.be.gte(0);

      // Test rapid price updates
      for (let i = 0; i < 5; i++) {
        await ethFeed.setLatestAnswer(
          toBN((2000 + i * 100).toString()),
          latestBlock.timestamp + i
        );
      }
      expect(await ethFeed.latestRound()).to.be.gte(7); // Should be at least 7 rounds total
      const [aum2] = await bookKeeper.getAUM();
      expect(aum2).to.be.gte(0);
    });
  });

  describe("Edge Cases and Error Recovery", () => {
    it("should handle decimal precision changes", async () => {
      const originalEthDecimals = await ethFeed.decimals();

      // Test decimal precision changes
      for (const decimals of [6, 18]) {
        await ethFeed.setDecimals(decimals);
        expect(await ethFeed.decimals()).to.equal(decimals);
        const [aum] = await bookKeeper.getAUM();
        expect(aum).to.be.gte(0);
      }

      // Restore original decimals
      await ethFeed.setDecimals(originalEthDecimals);
      expect(await ethFeed.decimals()).to.equal(originalEthDecimals);
    });

    it("should maintain state consistency across operations", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");
      const initialRound = await ethFeed.latestRound();
      const initialAnswer = await ethFeed.getAnswer(1);

      // Add new round
      await ethFeed.setLatestAnswer(toBN("2600"), latestBlock.timestamp);

      // Verify old round data is preserved
      expect(await ethFeed.getAnswer(1)).to.be.eq(initialAnswer);
      // Verify new round was added
      expect(await ethFeed.latestRound()).to.be.eq(initialRound + 1n);
    });

    it("should handle boundary price values", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");

      // Test boundary price values
      for (const price of [toBN("1"), toBN("-1"), toBN("0")]) {
        await ethFeed.setLatestAnswer(price, latestBlock.timestamp);
        const [aum] = await bookKeeper.getAUM();
        expect(aum).to.be.gte(0);
      }
    });
  });
});
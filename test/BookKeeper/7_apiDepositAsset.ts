import { expect, hre, loadFixture, createFixture } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import type { AccountNFTBookKeeper } from "../../typechain-types/index.js";

describe("API Feed - Dual-Unit BookKeeper Interface", function () {
  let bookKeeper: AccountNFTBookKeeper;

  // Test with API as depositAsset to verify constant $1.00 pricing
  const deployContractsFixture = createFixture(
    'accountNFT',
    'none',
    'API',
    true,
    0,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);
    bookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper;
  });

  it("should have API feed that always returns $1.00", async () => {
    const apiFeed = hre.f.SC.apiFeed;

    // Check that API feed returns constant $1.00 with 8 decimals
    const [, price] = await apiFeed.latestRoundData();
    const decimals = await apiFeed.decimals();

    expect(price).to.equal(100000000); // $1.00 with 8 decimals
    expect(decimals).to.equal(8);
  });

  it("should demonstrate API dual-unit behavior (USD ≈ API)", async () => {
    // Get current values
    const [aumUsd, aumApi] = await bookKeeper.getAUM();
    const [navUsd, navApi] = await bookKeeper.getNAV();

    // For API (USD-equivalent token), the USD and API values should be very close
    // NAV USD should be ~$1 (1e18), NAV API should be ~1 API (1e18)
    expect(navUsd).to.be.gt(0);
    expect(navApi).to.be.gt(0);

    // Since API is USD-equivalent, after accounting for decimals, the ratio should be close to 1:1
    if (navUsd > 0 && navApi > 0) {
      // API has 6 decimals, USD values are in 18 decimals
      // Normalize API to 18 decimals for comparison: navApi * 10^12
      const normalizedNavApi = navApi * (10n ** 12n);

      // Convert to number and check ratio
      const ratioBigInt = (navUsd * 1000n) / normalizedNavApi; // Multiply by 1000 for precision
      expect(Number(ratioBigInt)).to.be.closeTo(1000, 100); // Allow 10% variance (1000 ± 100)
    }
  });

  it("should have current block timestamp", async () => {
    const apiFeed = hre.f.SC.apiFeed;

    const [, , , timestamp1] = await apiFeed.latestRoundData();
    expect(timestamp1).to.be.gt(0);

    // API feed always returns current block timestamp, so it should be fresh
    const blockTimestamp = (await hre.ethers.provider.getBlock('latest'))!.timestamp;
    expect(timestamp1).to.equal(blockTimestamp);

    // Mine a new block and verify timestamp updates automatically
    await hre.ethers.provider.send("evm_mine", []);

    const [, , , timestamp2] = await apiFeed.latestRoundData();
    const newBlockTimestamp = (await hre.ethers.provider.getBlock('latest'))!.timestamp;
    expect(timestamp2).to.equal(newBlockTimestamp);
    expect(timestamp2).to.be.gte(timestamp1); // Should be same or newer
  });

  it("should verify API vs USDC behavior difference", async () => {
    // This test shows the difference between using dedicated API feed vs USDC feed
    const apiFeed = hre.f.SC.apiFeed;
    const usdcFeed = hre.f.SC.USDCFeed;

    const [, apiPrice] = await apiFeed.latestRoundData();
    const [, usdcPrice] = await usdcFeed.latestRoundData();

    // API feed should always return exactly $1.00
    expect(apiPrice).to.equal(100000000);

    // USDC feed might be different (though it's also set to $1.00 in tests)
    expect(usdcPrice).to.be.gt(0);
  });
});
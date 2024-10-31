import { ethers } from "ethers";
import { seedFixture } from "../../scripts/utils/fixture";
import { expect, hre } from "../../scripts/utils/testSetup";
import { toBN } from "../../scripts/utils/web3utils";

describe("Feeds - Testing (using BookKeeper)", () => {
  beforeEach(() => seedFixture({}));

  describe("Fixture test", () => {
    it("Check the feed exists and gives correct seeded data(2000)", async () => {
      expect(hre.f.SC.ethFeed).to.not.be.undefined;
      expect(hre.f.SC.ethFeed).to.not.be.null;
      expect(await hre.f.SC.ethFeed.latestRound()).to.be.eq(1);
      expect(await hre.f.SC.ethFeed.getAnswer(1)).to.be.eq(toBN("2000"));
    });

    it("check that the feed can be updated", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");
      await hre.f.SC.ethFeed.setLatestAnswer(
        toBN("1000"),
        latestBlock.timestamp
      );
      expect(await hre.f.SC.ethFeed.latestRound()).to.be.eq(2);
      expect(await hre.f.SC.ethFeed.getAnswer(1)).to.be.eq(toBN("2000"));
    });

    it("check USDC feed exists and gives correct seeded data(1)", async () => {
      expect(hre.f.SC.USDCFeed).to.not.be.undefined;
      expect(hre.f.SC.USDCFeed).to.not.be.null;
      expect(await hre.f.SC.USDCFeed.latestRound()).to.be.eq(1);
      expect(await hre.f.SC.USDCFeed.getAnswer(1)).to.be.eq(
        ethers.parseUnits("1", 6)
      );
    });

    it("check that feed can be updated", async () => {
      const latestBlock = await hre.ethers.provider.getBlock("latest");
      await hre.f.SC.USDCFeed.setLatestAnswer(
        ethers.parseUnits("2", 6),
        latestBlock.timestamp
      );
      expect(await hre.f.SC.USDCFeed.latestRound()).to.be.eq(2);
      expect(await hre.f.SC.USDCFeed.getAnswer(1)).to.be.eq(
        ethers.parseUnits("1", 6)
      );
    });
  });
});

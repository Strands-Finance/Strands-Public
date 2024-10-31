import { ethers } from "ethers";
import { seedFixture } from "../../scripts/utils/fixture";
import { expect, hre } from "../../scripts/utils/testSetup";
import { toBN, toBytes32 } from "../../scripts/utils/web3utils";

describe("Spot Pricing - Testing (using BookKeeper)", () => {
  beforeEach(() => seedFixture({}));

  describe("Check spot balances and AUM is correctly calculated", () => {
    it("check the case where the executor is holding USDC", async () => {
      const usdcBalance = await hre.f.SC.MockUSDC.balanceOf(
        await hre.f.SC.repositoryContracts[0].repository.getAddress()
      ); // format to 18 decimals

      expect(usdcBalance).to.be.eq(ethers.parseUnits("50000", 6));

      // check that the repository has 0 nav
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.getAUM()
      ).to.be.eq(toBN("50000"));

      // send 100k usdc to the executor
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        await hre.f.SC.repositoryContracts[0].executor.getAddress(),
        ethers.parseUnits("100000", 6)
      );

      // check that the repository has 100k nav
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.getAUM()
      ).to.be.eq(toBN("150000"));
    });

    it("send 10 eth to executor and see if that is reflected in the pool value", async () => {
      // check that the repository has 0 nav
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.getAUM()
      ).to.be.eq(toBN("50000"));

      // send 10 eth to the executor
      await hre.f.SC.MockWETH.connect(hre.f.SC.deployer).mint(
        await hre.f.SC.repositoryContracts[0].executor.getAddress(),
        ethers.parseUnits("10", 18)
      );

      // check feed price of weth is 2k usd
      const latestRound = await hre.f.SC.ethFeed.latestRound();
      expect(await hre.f.SC.ethFeed.getAnswer(latestRound)).to.be.eq(
        toBN("2000")
      );

      // check balance of executor
      expect(
        await hre.f.SC.MockWETH.balanceOf(
          await hre.f.SC.repositoryContracts[0].executor.getAddress()
        )
      ).to.be.eq(toBN("10"));

      // add feed to the bookkeeper
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.deployer)
        .addFeed(
          toBytes32("WETH/USD"),
          await hre.f.SC.ethFeedWrapper.getAddress(),
          await hre.f.SC.MockWETH.getAddress(),
          await hre.f.SC.MockWETH.decimals()
        );

      // check that the repository has 50k + 10*2k = 70k AUM
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.getAUM()
      ).to.be.eq(toBN("70000"));
    });
  });
});

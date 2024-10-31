import { seedFixture } from "../../scripts/utils/fixture";
import { hre } from "../../scripts/utils/testSetup";

const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("Repository Factory Fee - Testing (using BookKeeper)", () => {
  beforeEach(() => seedFixture({}));

  describe("Factory Repository - fee test", () => {
    it("can set fee recipient address", async () => {
      await hre.f.SC.repositoryFactory
        .connect(hre.f.SC.deployer)
        .setFeeRecipient(hre.f.signers[1].address);
      expect(await hre.f.SC.repositoryFactory.feeRecipient()).to.be.eq(
        hre.f.signers[1].address
      );
    });

    it("can set fee and retrieve fee amount from repository", async () => {
      await hre.f.SC.repositoryFactory
        .connect(hre.f.SC.deployer)
        .setFeeRecipient(hre.f.signers[1].address);

      // check usdc in repository
      const amountInRepository = await hre.f.SC.MockUSDC.balanceOf(
        await hre.f.SC.repositoryContracts[0].repository.getAddress()
      );
      expect(amountInRepository).eq(ethers.parseUnits("50000", 6));

      // collect fee and check that it takes 0.01% of the repository
      await hre.f.SC.repositoryFactory
        .connect(hre.f.SC.controller)
        .collectFeesFromRepositories([0,2,3]);

      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].repository.getAddress()
        )
      ).to.be.closeTo(
        ethers.parseUnits("49999.999", 6),
        ethers.parseUnits("0.0001")
      );
      // owner is seeded with 50k so going to check if the additional 500 dollars has been transfered
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.signers[1].address)
      ).to.be.closeTo(
        ethers.parseUnits("0.000507", 6),
        ethers.parseUnits("0.0001")
      );
    });

    it("only owner of the repository factory can collect fees", async () => {
      // Try to collect fees with an account that is not the owner
      await expect(
        hre.f.SC.repositoryFactory
          .connect(hre.f.SC.userAccount)
          .collectFeesFromRepositories([0,1,2,3])
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryFactory,
        "OnlyController"
      );

      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.SC.userAccount)
          .collectLicensingFee()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyFactoryAllowed"
      );
    });

    it("only owner can remove the repository", async () => {
      const prevRepositoryInfo =
        await hre.f.SC.repositoryFactory.deployedRepositories(0);
      console.log("prevRepositoryInfo=",prevRepositoryInfo)

      await expect(
        hre.f.SC.repositoryFactory
          .connect(hre.f.SC.controller)
          .removeRepository(0)
      )
        .to.emit(hre.f.SC.repositoryFactory, "RepositoryRemoved")
        .withArgs(
          prevRepositoryInfo, /// repository address
          0,
          ethers.ZeroAddress
        );
    });
  });
});

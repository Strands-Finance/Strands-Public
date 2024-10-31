import { seedFixture } from "../../scripts/utils/fixture";
import { hre } from "../../scripts/utils/testSetup";
import { toBN } from "../../scripts/utils/web3utils";

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Repository Initialization - Testing (using BookKeeper)", function () {
  beforeEach(() => seedFixture({}));

  describe("setBookKeeper", function () {
    it("should revert if caller is not the owner", async function () {
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.SC.repositoryContracts[0].controller)
          .setBookKeeper(hre.f.SC.repositoryContracts[0].controller)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyOwner"
      );
    });

    it("should set the bookKeeper", async function () {
      const newBookKeeper = await ethers.getContractFactory("BookKeeper");
      const newBookKeeperInstance = await newBookKeeper.deploy(
        hre.f.SC.deployer.getAddress()
      );
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].owner)
        .setBookKeeper(await newBookKeeperInstance.getAddress());
      expect(
        await hre.f.SC.repositoryContracts[0].repository.bookKeeper()
      ).to.equal(await newBookKeeperInstance.getAddress());
    });
  });

  describe("Add/remove controller", function () {
    it("should revert if caller is not the owner - add controller", async function () {
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.SC.repositoryContracts[0].controller)
          .setIsController(hre.f.SC.repositoryContracts[0].controller, true)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyOwner"
      );
    });

    it("Owner should be able to add new controller", async function () {
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].owner)
        .setIsController(await hre.f.alice.getAddress(), true);
      expect(
        await hre.f.SC.repositoryContracts[0].repository.isController(
          await hre.f.alice.getAddress()
        )
      ).to.equal(true);
    });

    it("should revert if caller is not the owner - remove controller", async function () {
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.SC.repositoryContracts[0].controller)
          .setIsController(hre.f.SC.repositoryContracts[0].controller, true)
      ).to.be.to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyOwner"
      );
    });

    it("Owner should be able to remove controller", async function () {
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].owner)
        .setIsController(await hre.f.alice.getAddress(), true);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].owner)
        .setIsController(await hre.f.alice.getAddress(), false);
      expect(
        await hre.f.SC.repositoryContracts[0].repository.isController(
          await hre.f.alice.getAddress()
        )
      ).to.equal(false);
    });
  });

  describe("Repository - licensingFeeRate test", () => {
    it("Can set fees as controller", async () => {
      const newFeeRate = toBN("0.01");
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setLicensingFeeRate(newFeeRate);
      const feeRate =
        await hre.f.SC.repositoryContracts[0].repository.licensingFeeRate();
      expect(feeRate).to.be.eq(newFeeRate);
    });

    it("Can not set fees > 5%", async () => {
      const newFeeRate = toBN("0.06");
      await expect(hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setLicensingFeeRate(newFeeRate)).to.be.revertedWithCustomError(hre.f.SC.repositoryContracts[0].repository, "InvalidFeeRate");
    });

    it("Cannot set fees as not controller", async () => {
      const newFeeRate = toBN("0.01");

      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.SC.userAccount)
          .setLicensingFeeRate(newFeeRate)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyController"
      );
    });
  });
});

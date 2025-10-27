import { expect, hre, ethers, loadFixture, createFixture, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import { getTestConstants } from "../helpers/testConstants.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe(`Repository Initialization`, function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let controller: HardhatEthersSigner;
  let owner: HardhatEthersSigner;

  const deployContractsFixture = createFixture('simple', 'none', 'API', true, 0, "0");

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);
    alice = getAlice();
    bob = getBob();
    controller = hre.f.SC.repositoryContracts[0].controller;
    owner = hre.f.SC.repositoryContracts[0].owner;
  });

  describe("BookKeeper Management", function () {
    it("should manage bookKeeper with proper access controls", async function () {
      const repo = hre.f.SC.repositoryContracts[0].repository;

      // Test access control
      await expect(repo.connect(controller).setBookKeeper(controller.address))
        .to.be.revertedWithCustomError(repo, "OnlyOwner");

      // Test owner can set bookKeeper
      const newBookKeeper = await ethers.getContractFactory("AccountNFTBookKeeper");
      const newBookKeeperInstance = await newBookKeeper.deploy();
      await newBookKeeperInstance.waitForDeployment();
      const newBookKeeperAddress = await newBookKeeperInstance.getAddress();

      await repo.connect(owner).setBookKeeper(newBookKeeperAddress);
      expect(await repo.bookKeeper()).to.equal(newBookKeeperAddress);
    });
  });

  describe("Controller Management", function () {
    it("should manage controllers with proper access controls", async function () {
      const repo = hre.f.SC.repositoryContracts[0].repository;

      // Test access control
      await expect(repo.connect(controller).setIsController(controller.address, true))
        .to.be.revertedWithCustomError(repo, "OnlyOwner");

      // Test owner can add controller
      await repo.connect(owner).setIsController(alice.address, true);
      expect(await repo.isController(alice.address)).to.equal(true);

      // Test owner can remove controller
      await repo.connect(owner).setIsController(alice.address, false);
      expect(await repo.isController(alice.address)).to.equal(false);
    });
  });

  describe("Repository Token Management", () => {
    it("should prevent setting repository token twice", async function () {
      const repo = hre.f.SC.repositoryContracts[0].repository;
      const TEST_CONSTANTS = await getTestConstants();

      // Deploy a second repository token
      const RepositoryTokenFactory = await ethers.getContractFactory("RepositoryToken");
      const secondRepositoryToken = await RepositoryTokenFactory.deploy(
        "SecondRepositoryToken",
        "STK2",
        TEST_CONSTANTS.ZERO_ADDRESS,
        repo.getAddress()
      );

      // Should fail when trying to set repository token again
      await expect(repo.connect(owner).setRepositoryToken(await secondRepositoryToken.getAddress()))
        .to.be.revertedWithCustomError(repo, "RepositoryTokenAlreadySet");
    });

    it("should prevent enabling deposits/withdrawals before repository token is set", async function () {
      // Create a fixture without setting the repository token
      const fixtureWithoutToken = createFixture('simple', 'none', 'API', true, 0, "0", false);
      await loadFixture(fixtureWithoutToken);

      const repo = hre.f.SC.repositoryContracts[0].repository;
      const testController = hre.f.SC.repositoryContracts[0].controller;

      // Verify repository token is NOT set
      expect(await repo.repositoryToken()).to.equal("0x0000000000000000000000000000000000000000");

      // Should fail when trying to enable deposits
      await expect(repo.connect(testController).setDepositEnabled(true))
        .to.be.revertedWithCustomError(repo, "RepositoryTokenNotSet");

      // Should fail when trying to enable withdrawals
      await expect(repo.connect(testController).setWithdrawEnabled(true))
        .to.be.revertedWithCustomError(repo, "RepositoryTokenNotSet");
    });
  });

  describe("Licensing Fee Management", () => {
    it("should manage licensing fees with proper validation", async () => {
      const repo = hre.f.SC.repositoryContracts[0].repository;

      // Test access control
      await expect(repo.connect(bob).setLicensingFeeRate(toBN("0.01")))
        .to.be.revertedWithCustomError(repo, "OnlyController");

      // Test valid fee setting
      const validFeeRate = toBN("0.01");
      await repo.connect(controller).setLicensingFeeRate(validFeeRate);
      expect(await repo.licensingFeeRate()).to.be.eq(validFeeRate);

      // Test maximum fee boundary (5% should work)
      const maxFeeRate = toBN("0.05");
      await expect(repo.connect(controller).setLicensingFeeRate(maxFeeRate))
        .to.not.be.rejected;

      // Test fee rate above maximum
      await expect(repo.connect(controller).setLicensingFeeRate(toBN("0.06")))
        .to.be.revertedWithCustomError(repo, "InvalidFeeRate");
      await expect(repo.connect(controller).setLicensingFeeRate(toBN("0.0501")))
        .to.be.revertedWithCustomError(repo, "InvalidFeeRate");
    });
  });

  describe("Controller Permission Lifecycle", function () {
    it("should properly handle controller permission changes", async function () {
      const repo = hre.f.SC.repositoryContracts[0].repository;

      // Add alice as controller
      await repo.connect(owner).setIsController(alice.address, true);

      // Verify alice can perform controller actions
      const newFeeRate = toBN("0.01");
      await expect(repo.connect(alice).setLicensingFeeRate(newFeeRate))
        .to.not.be.rejected;

      // Remove alice as controller
      await repo.connect(owner).setIsController(alice.address, false);

      // Verify alice can no longer perform controller actions
      await expect(repo.connect(alice).setLicensingFeeRate(toBN("0.02")))
        .to.be.revertedWithCustomError(repo, "OnlyController");
    });
  });
});

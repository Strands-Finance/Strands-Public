import { expect, hre, ethers, loadFixture, createFixture, approveAndDeposit, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import type { Repository, RepositoryToken, DirectInputBookKeeper, TestERC20SetDecimals } from "../../typechain-types/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Error Validation and Edge Cases", function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  // Contract shortcuts for better readability
  let repo: Repository;
  let repoToken: RepositoryToken;
  let mockUSDC: TestERC20SetDecimals;
  let bookKeeper: DirectInputBookKeeper;
  let controller: HardhatEthersSigner;

  // Cached addresses to avoid repeated async calls
  let aliceAddress: string;
  let bobAddress: string;

  const deployContractsFixture = createFixture(
    'directInput',
    'none',
    'USDC',
    true,
    0,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);

    // Initialize signers
    alice = getAlice();
    bob = getBob();

    // Set up contract shortcuts
    repo = hre.f.SC.repositoryContracts[0].repository;
    repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
    mockUSDC = hre.f.SC.MockUSDC;
    bookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper as DirectInputBookKeeper;
    controller = hre.f.SC.repositoryContracts[0].controller;

    // Cache frequently used addresses
    [aliceAddress, bobAddress] = await Promise.all([
      alice.getAddress(),
      bob.getAddress()
    ]);
  });

  describe("Batch Size Limit Validation", () => {
    it("should revert when processDeposits limit exceeds MAX_BATCH_SIZE", async () => {
      const MAX_BATCH_SIZE = await repo.MAX_BATCH_SIZE();

      await expect(
        repo.connect(controller).processDeposits(MAX_BATCH_SIZE + 1n)
      ).to.be.revertedWithCustomError(repo, "BatchSizeExceedsMaximum")
        .withArgs(MAX_BATCH_SIZE + 1n, MAX_BATCH_SIZE);
    });

    it("should allow processDeposits with limit equal to MAX_BATCH_SIZE", async () => {
      const MAX_BATCH_SIZE = await repo.MAX_BATCH_SIZE();

      // Should not revert (even though there are no deposits to process)
      await repo.connect(controller).processDeposits(MAX_BATCH_SIZE);
    });

    it("should revert when processWithdrawals limit exceeds MAX_BATCH_SIZE", async () => {
      const MAX_BATCH_SIZE = await repo.MAX_BATCH_SIZE();

      await expect(
        repo.connect(controller).processWithdrawals(MAX_BATCH_SIZE + 1n)
      ).to.be.revertedWithCustomError(repo, "BatchSizeExceedsMaximum")
        .withArgs(MAX_BATCH_SIZE + 1n, MAX_BATCH_SIZE);
    });

    it("should allow processWithdrawals with limit equal to MAX_BATCH_SIZE", async () => {
      const MAX_BATCH_SIZE = await repo.MAX_BATCH_SIZE();

      // Should not revert (even though there are no withdrawals to process)
      await repo.connect(controller).processWithdrawals(MAX_BATCH_SIZE);
    });

    it("should revert when initiateWithdrawAllFor addresses array exceeds MAX_BATCH_SIZE", async () => {
      const MAX_BATCH_SIZE = await repo.MAX_BATCH_SIZE();

      // Enable withdrawals first
      await repo.connect(controller).setWithdrawEnabled(true);

      // Create an array with MAX_BATCH_SIZE + 1 addresses
      const addresses = Array(Number(MAX_BATCH_SIZE) + 1).fill(aliceAddress);

      await expect(
        repo.connect(controller).initiateWithdrawAllFor(addresses)
      ).to.be.revertedWithCustomError(repo, "BatchSizeExceedsMaximum")
        .withArgs(addresses.length, MAX_BATCH_SIZE);
    });

    it("should allow initiateWithdrawAllFor with array length equal to MAX_BATCH_SIZE", async () => {
      const MAX_BATCH_SIZE = await repo.MAX_BATCH_SIZE();

      // Enable withdrawals first
      await repo.connect(controller).setWithdrawEnabled(true);

      // Create an array with exactly MAX_BATCH_SIZE addresses
      const addresses = Array(Number(MAX_BATCH_SIZE)).fill(aliceAddress);

      // Should not revert
      await repo.connect(controller).initiateWithdrawAllFor(addresses);
    });

    it("should handle edge case with limit of 1", async () => {
      // Queue a deposit
      const amount = toBN("100", 6);
      await approveAndDeposit(alice, amount, true, 'USDC');

      // Process with limit of 1 should work
      await repo.connect(controller).processDeposits(1);
    });

    it("should handle batch processing with actual deposits up to limit", async () => {
      // Create 5 deposits
      const amount = toBN("100", 6);
      for (let i = 0; i < 5; i++) {
        await approveAndDeposit(alice, amount, true, 'USDC');
      }

      // Process 3 at a time
      await repo.connect(controller).processDeposits(3);

      // Process remaining 2
      await repo.connect(controller).processDeposits(3);
    });
  });

  describe("BookKeeper Initialization Validation", () => {
    it("should revert when initializing BookKeeper with zero RepositoryToken", async () => {
      // Deploy RepositoryFactory for proper Repository setup
      const RepositoryFactoryContract = await ethers.getContractFactory("RepositoryFactory");
      const testFactory = await RepositoryFactoryContract.deploy(
        await hre.f.deployer.getAddress(), // owner
        await hre.f.deployer.getAddress(), // controller
        await hre.f.SC.MockWETH.getAddress() // WETH address
      );
      await testFactory.waitForDeployment();

      // Deploy a new BookKeeper
      const DirectInputBookKeeperFactory = await ethers.getContractFactory("DirectInputBookKeeper");
      const newBookKeeper = await DirectInputBookKeeperFactory.deploy();
      await newBookKeeper.waitForDeployment();

      // Deploy a basic GateKeeper for testing
      const WhitelistGateKeeperFactory = await ethers.getContractFactory("WhitelistGateKeeper");
      const testGateKeeper = await WhitelistGateKeeperFactory.deploy();
      await testGateKeeper.waitForDeployment();

      // Deploy Repository from factory address using impersonation
      const factoryAddress = await testFactory.getAddress();
      await ethers.provider.send("hardhat_impersonateAccount", [factoryAddress]);
      await ethers.provider.send("hardhat_setBalance", [factoryAddress, "0x1000000000000000000"]);
      const factorySigner = await ethers.provider.getSigner(factoryAddress);

      const RepositoryContract = await ethers.getContractFactory("Repository");
      const newRepo = await RepositoryContract.connect(factorySigner).deploy(
        await hre.f.deployer.getAddress(),
        await controller.getAddress()
      );
      await newRepo.waitForDeployment();

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [factoryAddress]);

      // Initialize the repository with our new bookkeeper
      await newRepo.connect(hre.f.deployer).init(
        await controller.getAddress(), // executor
        await newBookKeeper.getAddress(), // bookkeeper
        await testGateKeeper.getAddress(), // gatekeeper
        await mockUSDC.getAddress(), // deposit asset
        toBN("1000000"), // totalValueCap18
        0 // licensingFeeRate
      );

      // Try to initialize BookKeeper before RepositoryToken is set
      // This should revert because repository.repositoryToken() returns address(0)
      await expect(
        newBookKeeper.connect(hre.f.deployer).init(await newRepo.getAddress())
      ).to.be.revertedWithCustomError(newBookKeeper, "InvalidAddress");
    });

    it("should successfully initialize BookKeeper after RepositoryToken is set", async () => {
      // Deploy RepositoryFactory for proper Repository setup
      const RepositoryFactoryContract = await ethers.getContractFactory("RepositoryFactory");
      const testFactory = await RepositoryFactoryContract.deploy(
        await hre.f.deployer.getAddress(), // owner
        await hre.f.deployer.getAddress(), // controller
        await hre.f.SC.MockWETH.getAddress() // WETH address
      );
      await testFactory.waitForDeployment();

      // Deploy a new BookKeeper
      const DirectInputBookKeeperFactory = await ethers.getContractFactory("DirectInputBookKeeper");
      const newBookKeeper = await DirectInputBookKeeperFactory.deploy();
      await newBookKeeper.waitForDeployment();

      // Deploy a basic GateKeeper for testing
      const WhitelistGateKeeperFactory = await ethers.getContractFactory("WhitelistGateKeeper");
      const testGateKeeper = await WhitelistGateKeeperFactory.deploy();
      await testGateKeeper.waitForDeployment();

      // Deploy Repository from factory address using impersonation
      const factoryAddress = await testFactory.getAddress();
      await ethers.provider.send("hardhat_impersonateAccount", [factoryAddress]);
      await ethers.provider.send("hardhat_setBalance", [factoryAddress, "0x1000000000000000000"]);
      const factorySigner = await ethers.provider.getSigner(factoryAddress);

      const RepositoryContract = await ethers.getContractFactory("Repository");
      const newRepo = await RepositoryContract.connect(factorySigner).deploy(
        await hre.f.deployer.getAddress(),
        await controller.getAddress()
      );
      await newRepo.waitForDeployment();

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [factoryAddress]);

      // Initialize the repository
      await newRepo.connect(hre.f.deployer).init(
        await controller.getAddress(),
        await newBookKeeper.getAddress(),
        await testGateKeeper.getAddress(),
        await mockUSDC.getAddress(),
        toBN("1000000"),
        0
      );

      // Deploy and set RepositoryToken
      const RepositoryTokenFactory = await ethers.getContractFactory("RepositoryToken");
      const newRepoToken = await RepositoryTokenFactory.deploy(
        "Test Token",
        "TEST",
        await testGateKeeper.getAddress(),
        await newRepo.getAddress()
      );
      await newRepoToken.waitForDeployment();

      await newRepo.connect(hre.f.deployer).setRepositoryToken(await newRepoToken.getAddress());

      // Now BookKeeper initialization should succeed
      await newBookKeeper.connect(hre.f.deployer).init(await newRepo.getAddress());

      // Verify it was initialized correctly
      expect(await newBookKeeper.repository()).to.equal(await newRepo.getAddress());
    });

    it("should revert when BookKeeper is initialized with wrong repository", async () => {
      // Deploy RepositoryFactory for proper Repository setup
      const RepositoryFactoryContract = await ethers.getContractFactory("RepositoryFactory");
      const testFactory = await RepositoryFactoryContract.deploy(
        await hre.f.deployer.getAddress(), // owner
        await hre.f.deployer.getAddress(), // controller
        await hre.f.SC.MockWETH.getAddress() // WETH address
      );
      await testFactory.waitForDeployment();

      // Deploy a new BookKeeper
      const DirectInputBookKeeperFactory = await ethers.getContractFactory("DirectInputBookKeeper");
      const newBookKeeper = await DirectInputBookKeeperFactory.deploy();
      await newBookKeeper.waitForDeployment();

      // Deploy a basic GateKeeper for testing
      const WhitelistGateKeeperFactory = await ethers.getContractFactory("WhitelistGateKeeper");
      const testGateKeeper = await WhitelistGateKeeperFactory.deploy();
      await testGateKeeper.waitForDeployment();

      // Deploy a new Repository that points to a DIFFERENT bookkeeper
      const anotherBookKeeper = await DirectInputBookKeeperFactory.deploy();
      await anotherBookKeeper.waitForDeployment();

      // Deploy Repository from factory address using impersonation
      const factoryAddress = await testFactory.getAddress();
      await ethers.provider.send("hardhat_impersonateAccount", [factoryAddress]);
      await ethers.provider.send("hardhat_setBalance", [factoryAddress, "0x1000000000000000000"]);
      const factorySigner = await ethers.provider.getSigner(factoryAddress);

      const RepositoryContract = await ethers.getContractFactory("Repository");
      const newRepo = await RepositoryContract.connect(factorySigner).deploy(
        await hre.f.deployer.getAddress(),
        await controller.getAddress()
      );
      await newRepo.waitForDeployment();

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [factoryAddress]);

      // Initialize repository with anotherBookKeeper
      await newRepo.connect(hre.f.deployer).init(
        await controller.getAddress(),
        await anotherBookKeeper.getAddress(), // Different bookkeeper!
        await testGateKeeper.getAddress(),
        await mockUSDC.getAddress(),
        toBN("1000000"),
        0
      );

      // Set RepositoryToken
      const RepositoryTokenFactory = await ethers.getContractFactory("RepositoryToken");
      const newRepoToken = await RepositoryTokenFactory.deploy(
        "Test Token",
        "TEST",
        await testGateKeeper.getAddress(),
        await newRepo.getAddress()
      );
      await newRepoToken.waitForDeployment();
      await newRepo.connect(hre.f.deployer).setRepositoryToken(await newRepoToken.getAddress());

      // Try to initialize newBookKeeper with this repository
      // Should fail because repository.bookKeeper() != newBookKeeper
      await expect(
        newBookKeeper.connect(hre.f.deployer).init(await newRepo.getAddress())
      ).to.be.revertedWithCustomError(newBookKeeper, "InvalidAddress");
    });
  });

  describe("NFTGateKeeper Constructor Validation", () => {
    it("should revert when NFTGateKeeper is deployed with zero address", async () => {
      const NFTGateKeeperFactory = await ethers.getContractFactory("NFTGateKeeper");
      const deployment = NFTGateKeeperFactory.deploy("0x0000000000000000000000000000000000000000");

      await expect(deployment).to.be.revertedWithCustomError(NFTGateKeeperFactory, "InvalidNFTAddress");
    });

    it("should successfully deploy NFTGateKeeper with valid address", async () => {
      const NFTGateKeeperFactory = await ethers.getContractFactory("NFTGateKeeper");

      // Should not revert with a valid address
      const gateKeeper = await NFTGateKeeperFactory.deploy(aliceAddress);
      await gateKeeper.waitForDeployment();

      expect(await gateKeeper.nftCollectionAddress()).to.equal(aliceAddress);
    });
  });

  describe("Additional Edge Cases", () => {
    it("should handle zero value in BatchSizeExceedsMaximum (edge case)", async () => {
      // Processing with 0 limit should work (it just won't process anything)
      await repo.connect(controller).processDeposits(0);

      await repo.connect(controller).processWithdrawals(0);
    });

    it("should handle empty array in initiateWithdrawAllFor", async () => {
      await repo.connect(controller).setWithdrawEnabled(true);

      // Empty array should not revert
      await repo.connect(controller).initiateWithdrawAllFor([]);
    });

    it("should verify MAX_BATCH_SIZE constant is set correctly", async () => {
      const MAX_BATCH_SIZE = await repo.MAX_BATCH_SIZE();

      // Verify it's set to 100 as defined in the contract
      expect(MAX_BATCH_SIZE).to.equal(100);
    });
  });
});

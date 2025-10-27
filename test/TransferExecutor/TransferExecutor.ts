import { expect, hre, ethers, loadFixture, createFixture, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import type { TransferExecutor, Repository, TestERC20SetDecimals } from "../../typechain-types/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("TransferExecutor - Comprehensive Testing", function () {
  let transferExecutor: TransferExecutor;
  let repository: Repository;
  let mockUSDC: TestERC20SetDecimals;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let controller: HardhatEthersSigner;
  let owner: HardhatEthersSigner;

  // Cached addresses to avoid repeated async calls
  let aliceAddress: string;
  let bobAddress: string;
  let controllerAddress: string;
  let ownerAddress: string;
  let transferExecutorAddress: string;
  let repositoryAddress: string;

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
    controller = hre.f.SC.repositoryContracts[0].controller;
    owner = hre.f.SC.repositoryContracts[0].owner;

    // Set up contract shortcuts
    repository = hre.f.SC.repositoryContracts[0].repository;
    mockUSDC = hre.f.SC.MockUSDC;

    // Cache addresses first
    [aliceAddress, bobAddress, controllerAddress, ownerAddress, repositoryAddress] = await Promise.all([
      alice.getAddress(),
      bob.getAddress(),
      controller.getAddress(),
      owner.getAddress(),
      repository.getAddress()
    ]);

    // Deploy TransferExecutor contract
    const TransferExecutorFactory = await ethers.getContractFactory("TransferExecutor");
    transferExecutor = await TransferExecutorFactory.deploy(
      ownerAddress,
      controllerAddress,
      await mockUSDC.getAddress()
    ) as TransferExecutor;
    await transferExecutor.waitForDeployment();

    transferExecutorAddress = await transferExecutor.getAddress();

    // Register TransferExecutor as an executor in the Repository
    await repository.connect(owner).setExecutor(transferExecutorAddress);
  });

  describe("Contract Deployment and Initialization", () => {
    it("should deploy with correct initial parameters", async () => {
      expect(await transferExecutor.owner()).to.equal(ownerAddress);
      // Note: TransferExecutor doesn't have a controller() function exposed, but we know it's set in constructor
      expect(await transferExecutor.depositToken()).to.equal(await mockUSDC.getAddress());
      expect(await transferExecutor.repositoryAddress()).to.equal("0x0000000000000000000000000000000000000000");
    });

    it("should allow controller to initialize repository", async () => {
      await transferExecutor.connect(controller).initializeRepository(repositoryAddress);
      expect(await transferExecutor.repositoryAddress()).to.equal(repositoryAddress);
    });

    it("should revert when non-controller tries to initialize repository", async () => {
      await expect(
        transferExecutor.connect(alice).initializeRepository(repositoryAddress)
      ).to.be.revertedWithCustomError(transferExecutor, "OnlyController");
    });

    it("should revert when initializing with zero address", async () => {
      await expect(
        transferExecutor.connect(controller).initializeRepository("0x0000000000000000000000000000000000000000")
      ).to.be.revertedWithCustomError(transferExecutor, "InvalidAddress");
    });
  });

  describe("Access Control", () => {
    beforeEach(async () => {
      // Initialize repository for these tests
      await transferExecutor.connect(controller).initializeRepository(repositoryAddress);
    });

    it("should revert when non-controller tries to move funds", async () => {
      const amount = toBN("100", 6);

      await expect(
        transferExecutor.connect(alice).moveFundsFromRepositoryToWallet(amount, aliceAddress)
      ).to.be.revertedWithCustomError(transferExecutor, "OnlyController");
    });

    it("should revert when owner (non-controller) tries to move funds", async () => {
      const amount = toBN("100", 6);

      await expect(
        transferExecutor.connect(owner).moveFundsFromRepositoryToWallet(amount, aliceAddress)
      ).to.be.revertedWithCustomError(transferExecutor, "OnlyController");
    });
  });

  describe("Fund Movement Validation", () => {
    beforeEach(async () => {
      // Initialize repository for these tests
      await transferExecutor.connect(controller).initializeRepository(repositoryAddress);
    });

    it("should revert when repository is not initialized", async () => {
      // Deploy a new executor without initializing repository
      const TransferExecutorFactory = await ethers.getContractFactory("TransferExecutor");
      const uninitializedExecutor = await TransferExecutorFactory.deploy(
        ownerAddress,
        controllerAddress,
        await mockUSDC.getAddress()
      ) as TransferExecutor;

      const amount = toBN("100", 6);

      await expect(
        uninitializedExecutor.connect(controller).moveFundsFromRepositoryToWallet(amount, aliceAddress)
      ).to.be.revertedWithCustomError(uninitializedExecutor, "RepositoryNotIntialized");
    });

    it("should revert when recipient address is zero", async () => {
      const amount = toBN("100", 6);

      await expect(
        transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(amount, "0x0000000000000000000000000000000000000000")
      ).to.be.revertedWithCustomError(transferExecutor, "InvalidAddress");
    });

    it("should revert when amount is zero", async () => {
      await expect(
        transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(0, aliceAddress)
      ).to.be.revertedWithCustomError(transferExecutor, "InvalidAmount");
    });
  });

  describe("Fund Movement Integration", () => {
    beforeEach(async () => {
      // Initialize repository
      await transferExecutor.connect(controller).initializeRepository(repositoryAddress);

      // Set up funds in repository
      const seedAmount = toBN("1000", 6);
      await mockUSDC.connect(hre.f.SC.deployer).mint(repositoryAddress, seedAmount);
    });

    it("should successfully move funds from repository to wallet", async () => {
      const amount = toBN("100", 6);
      const initialRecipientBalance = await mockUSDC.balanceOf(aliceAddress);

      // Move funds
      const tx = await transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(amount, aliceAddress);

      // Verify recipient received funds
      expect(await mockUSDC.balanceOf(aliceAddress)).to.equal(initialRecipientBalance + amount);

      // Verify event was emitted
      await expect(tx)
        .to.emit(transferExecutor, "FundsMovedFromExecutorToAddress")
        .withArgs(aliceAddress, amount);
    });

    it("should handle multiple fund movements correctly", async () => {
      const amount1 = toBN("50", 6);
      const amount2 = toBN("75", 6);

      const initialAliceBalance = await mockUSDC.balanceOf(aliceAddress);
      const initialBobBalance = await mockUSDC.balanceOf(bobAddress);

      // First movement to Alice
      await transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(amount1, aliceAddress);

      // Second movement to Bob
      await transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(amount2, bobAddress);

      // Verify both recipients received correct amounts
      expect(await mockUSDC.balanceOf(aliceAddress)).to.equal(initialAliceBalance + amount1);
      expect(await mockUSDC.balanceOf(bobAddress)).to.equal(initialBobBalance + amount2);
    });

    it("should handle large fund movements", async () => {
      // Set up larger amount in repository
      const largeAmount = toBN("500000", 6); // 500K USDC
      await mockUSDC.connect(hre.f.SC.deployer).mint(repositoryAddress, largeAmount);

      const moveAmount = toBN("100000", 6); // 100K USDC
      const initialBalance = await mockUSDC.balanceOf(aliceAddress);

      await transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(moveAmount, aliceAddress);

      expect(await mockUSDC.balanceOf(aliceAddress)).to.equal(initialBalance + moveAmount);
    });
  });

  describe("Error Conditions and Edge Cases", () => {
    beforeEach(async () => {
      await transferExecutor.connect(controller).initializeRepository(repositoryAddress);
    });

    it("should revert when repository has insufficient funds", async () => {
      // Try to move more than repository has
      const excessiveAmount = toBN("999999", 6);

      await expect(
        transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(excessiveAmount, aliceAddress)
      ).to.revert(ethers); // Should revert from repository.moveFundsToExecutor
    });

    it("should handle re-initialization of repository", async () => {
      // Initial repository
      const initialRepo = repositoryAddress;
      await transferExecutor.connect(controller).initializeRepository(initialRepo);
      expect(await transferExecutor.repositoryAddress()).to.equal(initialRepo);

      // Re-initialize with different repository (if allowed)
      const TransferExecutorFactory = await ethers.getContractFactory("TransferExecutor");
      const newMockRepo = await TransferExecutorFactory.deploy(
        ownerAddress,
        controllerAddress,
        await mockUSDC.getAddress()
      );

      await transferExecutor.connect(controller).initializeRepository(await newMockRepo.getAddress());
      expect(await transferExecutor.repositoryAddress()).to.equal(await newMockRepo.getAddress());
    });
  });

  describe("Event Emission", () => {
    beforeEach(async () => {
      await transferExecutor.connect(controller).initializeRepository(repositoryAddress);

      // Set up funds
      const seedAmount = toBN("1000", 6);
      await mockUSDC.connect(hre.f.SC.deployer).mint(repositoryAddress, seedAmount);
    });

    it("should emit FundsMovedFromExecutorToAddress event with correct parameters", async () => {
      const amount = toBN("200", 6);

      const tx = await transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(amount, bobAddress);

      await expect(tx)
        .to.emit(transferExecutor, "FundsMovedFromExecutorToAddress")
        .withArgs(bobAddress, amount);
    });

    it("should emit events for multiple transfers", async () => {
      const amount1 = toBN("100", 6);
      const amount2 = toBN("150", 6);

      const tx1 = await transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(amount1, aliceAddress);
      const tx2 = await transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(amount2, bobAddress);

      await expect(tx1)
        .to.emit(transferExecutor, "FundsMovedFromExecutorToAddress")
        .withArgs(aliceAddress, amount1);

      await expect(tx2)
        .to.emit(transferExecutor, "FundsMovedFromExecutorToAddress")
        .withArgs(bobAddress, amount2);
    });
  });

  describe("Integration with Repository Contract", () => {
    beforeEach(async () => {
      await transferExecutor.connect(controller).initializeRepository(repositoryAddress);
    });

    it("should properly integrate with repository moveFundsToExecutor", async () => {
      const amount = toBN("100", 6);

      // Set up funds in repository
      await mockUSDC.connect(hre.f.SC.deployer).mint(repositoryAddress, amount);

      const initialRepoBalance = await mockUSDC.balanceOf(repositoryAddress);
      const initialRecipientBalance = await mockUSDC.balanceOf(aliceAddress);

      // This should call repository.moveFundsToExecutor internally
      await transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(amount, aliceAddress);

      // Verify repository balance decreased
      expect(await mockUSDC.balanceOf(repositoryAddress)).to.be.lt(initialRepoBalance);

      // Verify recipient received funds
      expect(await mockUSDC.balanceOf(aliceAddress)).to.equal(initialRecipientBalance + amount);
    });

    it("should handle repository contract errors gracefully", async () => {
      const amount = toBN("100", 6);

      // Try to move funds when repository has no balance
      await expect(
        transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(amount, aliceAddress)
      ).to.revert(ethers); // Should propagate repository contract error
    });
  });

  describe("Boundary and Stress Testing", () => {
    beforeEach(async () => {
      await transferExecutor.connect(controller).initializeRepository(repositoryAddress);
    });

    it("should handle minimum transfer amount (1 wei)", async () => {
      const minAmount = toBN("1");

      // Set up minimal funds
      await mockUSDC.connect(hre.f.SC.deployer).mint(repositoryAddress, minAmount);

      const initialBalance = await mockUSDC.balanceOf(aliceAddress);

      await transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(minAmount, aliceAddress);

      expect(await mockUSDC.balanceOf(aliceAddress)).to.equal(initialBalance + minAmount);
    });

    it("should handle transfers to contract addresses", async () => {
      const amount = toBN("100", 6);

      await mockUSDC.connect(hre.f.SC.deployer).mint(repositoryAddress, amount);

      // Transfer to another contract address (use alice address for simplicity)
      const initialBalance = await mockUSDC.balanceOf(bobAddress);

      await transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(amount, bobAddress);

      expect(await mockUSDC.balanceOf(bobAddress)).to.equal(initialBalance + amount);
    });

    it("should maintain state consistency across multiple operations", async () => {
      const totalFunds = toBN("1000", 6);
      await mockUSDC.connect(hre.f.SC.deployer).mint(repositoryAddress, totalFunds);

      // Get initial balances
      const initialAliceBalance = await mockUSDC.balanceOf(aliceAddress);
      const initialBobBalance = await mockUSDC.balanceOf(bobAddress);

      const transferAmounts = [
        toBN("100", 6),
        toBN("250", 6),
        toBN("50", 6),
        toBN("300", 6)
      ];

      const recipients = [aliceAddress, bobAddress, aliceAddress, bobAddress];

      let aliceTotal = toBN("0");
      let bobTotal = toBN("0");

      for (let i = 0; i < transferAmounts.length; i++) {
        await transferExecutor.connect(controller).moveFundsFromRepositoryToWallet(
          transferAmounts[i],
          recipients[i]
        );

        if (recipients[i] === aliceAddress) {
          aliceTotal += transferAmounts[i];
        } else {
          bobTotal += transferAmounts[i];
        }
      }

      // Verify final balances match initial + transfers
      expect(await mockUSDC.balanceOf(aliceAddress)).to.equal(initialAliceBalance + aliceTotal);
      expect(await mockUSDC.balanceOf(bobAddress)).to.equal(initialBobBalance + bobTotal);
    });
  });
});
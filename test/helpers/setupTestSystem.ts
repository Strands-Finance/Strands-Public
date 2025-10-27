// Unified test setup system - combines deployFixture and seedTestSystem functionality
import chai, { expect } from 'chai';

// Import and use hardhat-ethers-chai-matchers for custom error matching
import '@nomicfoundation/hardhat-ethers-chai-matchers';

// Note: Using setupTestSystem caching instead of loadFixture for optimization

// Import ethers from the package directly
import { ethers as standaloneEthers } from "ethers";

// Import hardhat for network access
import hardhat from "hardhat";
const { network } = hardhat;

// Export expect for chai assertions
export { expect };

// Export common test signers for easy import
export const getAlice = () => hre.f.alice;
export const getBob = () => hre.f.bob;
export const getDeployer = () => hre.f.deployer;


// Export hardhat ethers for provider access - will be set in setupTestSystem
let hardhatEthersInstance: any = null;
export function getHardhatEthers() {
  return hardhatEthersInstance;
}

// Allow setting the hardhat ethers instance from external sources
export function setHardhatEthers(ethersInstance: any) {
  hardhatEthersInstance = ethersInstance;
}

// Export the hardhat ethers instance as 'ethers' for tests
export const ethers = {
  getSigners: async () => {
    if (!hardhatEthersInstance) {
      // Auto-initialize hardhat ethers for simple cases
      const { ethers: hardhatEthers } = await network.connect();
      hardhatEthersInstance = hardhatEthers;
    }
    return hardhatEthersInstance.getSigners();
  },
  getContractFactory: async (...args: any[]) => {
    if (!hardhatEthersInstance) {
      // Auto-initialize hardhat ethers for simple cases
      const { ethers: hardhatEthers } = await network.connect();
      hardhatEthersInstance = hardhatEthers;
    }
    return hardhatEthersInstance.getContractFactory(...args);
  },
  parseUnits: (...args: any[]) => {
    if (!hardhatEthersInstance) {
      return standaloneEthers.parseUnits(...args);
    }
    return hardhatEthersInstance.parseUnits(...args);
  },
  parseEther: (...args: any[]) => {
    if (!hardhatEthersInstance) {
      return standaloneEthers.parseEther(...args);
    }
    return hardhatEthersInstance.parseEther(...args);
  },
  encodeBytes32String: (...args: any[]) => {
    if (!hardhatEthersInstance) {
      return standaloneEthers.encodeBytes32String(...args);
    }
    return hardhatEthersInstance.encodeBytes32String(...args);
  },
  decodeBytes32String: (...args: any[]) => {
    if (!hardhatEthersInstance) {
      return standaloneEthers.decodeBytes32String(...args);
    }
    return hardhatEthersInstance.decodeBytes32String(...args);
  },
  get provider() {
    if (!hardhatEthersInstance) {
      throw new Error("Hardhat ethers provider not initialized. Call setupTestSystem() first or use test that properly initializes ethers.");
    }
    return hardhatEthersInstance.provider;
  }
};

// Import deployment functions directly to avoid circular dependencies
import { deployTestSystem } from "./deployTestSystem.js";
import { toBN, toBytes32 } from "../helpers/testUtils.js";
import { getTestConstants } from "./testConstants.js";

// Simple HRE-like object for test compatibility - will be updated with hardhat ethers
export const hre = {
  ethers: null as any, // This will be set to hardhat ethers in setupTestSystem
  network,
  f: {} as any, // This will be populated by setupTestSystem
};

export type BookKeeperType = 'simple' | 'directInput' | 'accountNFT';
export type GateKeeperType = 'none' | 'whitelist' | 'nft' | 'callback';
export type DepositAsset = 'USDC' | 'WETH' | 'API';

// Define types locally
type BigNumberish = string | number | bigint;
interface Signer {
  address: string;
  [key: string]: any;
}

// Define SignerWithAddress locally since the export is not available in ESM
interface SignerWithAddress extends Signer {
  address: string;
}

/**
 * Unified test setup system that deploys and initializes all contracts
 * @param bookKeeperType - Type of BookKeeper to deploy
 * @param gateKeeperType - Type of GateKeeper to deploy
 * @param depositAsset - Asset to use for deposits
 * @param useWalletExecutor - Whether to use wallet executor (vs contract executor)
 * @param seedAmount - Amount in USDC to seed repository with (0 = no seeding)
 * @param feeRate - Licensing fee rate (1% = 1e16, 0 = no fees)
 */
export async function setupTestSystem(
  bookKeeperType: BookKeeperType = 'accountNFT',
  gateKeeperType: GateKeeperType = 'none',
  depositAsset: DepositAsset = 'USDC',
  useWalletExecutor: boolean = true,
  seedAmount: number = 0, // in USDC terms (6 decimals)
  feeRate: string = "0", // licensing fee rate (1% = 1e16)
  setRepositoryToken: boolean = true
) {
  // Get ethers from hardhat network connection
  const { ethers: hardhatEthers } = await network.connect();

  // Update hre with hardhat ethers and store globally
  hre.ethers = hardhatEthers;
  hardhatEthersInstance = hardhatEthers;

  // Setup signers using hardhat's ethers
  const signers = await hardhatEthers.getSigners();
  hre.f = {} as any;
  hre.f.signers = signers;
  hre.f.deployer = signers[0];
  hre.f.alice = signers[6]; // Use signer[6] as Alice
  hre.f.bob = signers[2]; // Use signer[2] as Bob (same as SC.bob)

  // Deploy fresh system with explicit parameters using same ethers instance
  hre.f.SC = await deployTestSystem(
    bookKeeperType,
    gateKeeperType,
    depositAsset,
    useWalletExecutor,
    feeRate,
    hardhatEthers, // Pass the same ethers instance
    setRepositoryToken
  );

  // Initialize contracts
  await initialiseContracts(hre.f.SC, bookKeeperType, hre.f.alice, depositAsset, setRepositoryToken);

  // Give alice USDC by default (100k for general test operations) - using SC.deployer pattern
  await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).permitMint(hre.f.SC.deployer, true);
  await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).permitMint(hre.f.alice, true);
  await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(hre.f.alice, hardhatEthers.parseUnits("100000", 6));

  // Give bob USDC for tests that need it
  await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).permitMint(hre.f.SC.bob, true);

  // Seed repository if requested
  if (seedAmount > 0) {
    // Determine which asset to use and its decimals
    let assetContract, decimals;

    if (depositAsset === 'USDC') {
      assetContract = hre.f.SC.MockUSDC;
      decimals = 6;
    } else if (depositAsset === 'WETH') {
      assetContract = hre.f.SC.MockWETH;
      decimals = 18;
    } else if (depositAsset === 'API') {
      assetContract = hre.f.SC.strandsAPI;
      decimals = 6;
    } else {
      throw new Error(`Unsupported deposit asset: ${depositAsset}`);
    }

    const amount = hardhatEthers.parseUnits(seedAmount.toString(), decimals);

    // Enable deployer to mint to bob - use SC.deployer pattern
    if (depositAsset === 'API') {
      // For API (strandsAPI), use controller to mint
      await assetContract.connect(hre.f.SC.repositoryContracts[0].controller).mint(
        await hre.f.SC.bob.getAddress(),
        amount
      );
    } else {
      // For USDC/WETH, use deployer to permit and mint
      await assetContract.connect(hre.f.SC.deployer).permitMint(hre.f.SC.deployer, true);
      await assetContract.connect(hre.f.SC.deployer).permitMint(hre.f.SC.bob, true);
      await assetContract.connect(hre.f.SC.deployer).mint(hre.f.SC.bob, amount);
    }

    // Approve and deposit
    await assetContract.connect(hre.f.SC.bob).approve(
      await hre.f.SC.repositoryContracts[0].repository.getAddress(),
      amount
    );

    await hre.f.SC.repositoryContracts[0].repository
      .connect(hre.f.SC.bob)
      .initiateDeposit(amount, hardhatEthers.parseUnits("1", 18));

    // Process the deposit
    await hre.f.SC.repositoryContracts[0].repository
      .connect(hre.f.SC.repositoryContracts[0].controller)
      .processDeposits(1);

  } else {
    // If not seeding, still give bob assets for general test operations
    if (depositAsset === 'API') {
      // For API, mint using controller
      await hre.f.SC.strandsAPI.connect(hre.f.SC.repositoryContracts[0].controller).mint(
        await hre.f.SC.bob.getAddress(),
        hardhatEthers.parseUnits("100000", 6)
      );
    } else {
      // For USDC/WETH, use deployer to mint
      const assetContract = depositAsset === 'USDC' ? hre.f.SC.MockUSDC : hre.f.SC.MockWETH;
      const decimals = depositAsset === 'USDC' ? 6 : 18;
      await assetContract.connect(hre.f.SC.deployer).mint(hre.f.SC.bob, hardhatEthers.parseUnits("100000", decimals));
    }
  }

  return hre.f.SC;
}

// Contract initialization function (moved from seedTestSystem.ts)
export async function initialiseContracts(
  testSystem: any, // Using any type to avoid importing testSystemContracts
  bookKeeperType: 'simple' | 'directInput' | 'accountNFT',
  user?: SignerWithAddress,
  depositAsset: 'USDC' | 'WETH' | 'API' = 'USDC',
  setRepositoryToken: boolean = true
): Promise<void> {
  const TEST_CONSTANTS = await getTestConstants();

  await testSystem.ethFeed.connect(testSystem.deployer).setDecimals(TEST_CONSTANTS.PRICE_FEEDS.ETH_DECIMALS);

  const latestBlock = await hre.ethers.provider.getBlock("latest");
  if (!latestBlock?.timestamp) {
    throw new Error("Unable to get latest block timestamp");
  }

  // Set price feeds
  await testSystem.ethFeed
    .connect(testSystem.deployer)
    .setLatestAnswer(TEST_CONSTANTS.PRICE_FEEDS.ETH_PRICE, latestBlock.timestamp);

  await testSystem.USDCFeed.connect(testSystem.deployer).setLatestAnswer(
    TEST_CONSTANTS.PRICE_FEEDS.USDC_PRICE,
    latestBlock.timestamp
  );

  // Initialize specialized bookkeepers
  if (bookKeeperType === 'directInput' || bookKeeperType === 'simple') {
    // Only initialize BookKeeper if RepositoryToken is set
    // (BookKeeper.init() validates that repositoryToken is not address(0))
    if (setRepositoryToken) {
      await testSystem.repositoryContracts[0].bookKeeper.init(
        await testSystem.repositoryContracts[0].repository.getAddress()
      );

      // Add feeds to watchlist for feed-based valuation
      await testSystem.repositoryContracts[0].bookKeeper
        .connect(testSystem.repositoryContracts[0].controller)
        .addTokenToWatchlist(
          await testSystem.MockUSDC.getAddress(),
          await testSystem.usdcFeedWrapper.getAddress()
        );

      // Also add WETH to watchlist for price validation tests
      await testSystem.repositoryContracts[0].bookKeeper
        .connect(testSystem.repositoryContracts[0].controller)
        .addTokenToWatchlist(
          await testSystem.MockWETH.getAddress(),
          await testSystem.ethFeedWrapper.getAddress()
        );

      // Add StrandsAPI to watchlist using USDC feed (since API is pegged 1:1 with USD)
      await testSystem.repositoryContracts[0].bookKeeper
        .connect(testSystem.repositoryContracts[0].controller)
        .addTokenToWatchlist(
          await testSystem.strandsAPI.getAddress(),
          await testSystem.usdcFeedWrapper.getAddress()
        );

      // Ensure includeExecutor defaults to false (tests will set to true as needed)
      await testSystem.repositoryContracts[0].bookKeeper
        .connect(testSystem.repositoryContracts[0].controller)
        .setIncludeExecutor(false);

      if (bookKeeperType === 'directInput') {
        await testSystem.repositoryContracts[0].bookKeeper
          .connect(testSystem.repositoryContracts[0].controller)
          .markValueOffChainSettled(true);
      }
    }
  } else if (bookKeeperType === 'accountNFT') {
    const nftOwner = user || testSystem.userAccount;
    // Only initialize BookKeeper if RepositoryToken is set
    // (BookKeeper.init() validates that repositoryToken is not address(0))
    if (setRepositoryToken) {
      await testSystem.repositoryContracts[0].bookKeeper.init(
        await testSystem.repositoryContracts[0].repository.getAddress()
      );
      await initializeAccountNFTBookKeeper(testSystem, latestBlock.timestamp, nftOwner);

      // Add deposit asset feed to watchlist for AccountNFT BookKeeper (only if not already added)
      if (depositAsset === 'API') {
        // API is not added by initializeAccountNFTBookKeeper, so add it here
        await testSystem.repositoryContracts[0].bookKeeper
          .connect(testSystem.repositoryContracts[0].controller)
          .addTokenToWatchlist(
            await testSystem.strandsAPI.getAddress(),
            await testSystem.apiFeedWrapper.getAddress()
          );
      }
      // USDC and WETH are already added by initializeAccountNFTBookKeeper

      await testSystem.repositoryContracts[0].bookKeeper
        .connect(testSystem.repositoryContracts[0].controller)
        .markValueOffChainSettled(true);
    }
  } else {
    await initializeStandardBookKeeper(testSystem);
  }
}

// Helper function for account bookkeeper initialization
async function initializeAccountNFTBookKeeper(
  testSystem: any,
  timestamp: number,
  user: SignerWithAddress
): Promise<void> {
  const TEST_CONSTANTS = await getTestConstants();

  await testSystem.repositoryContracts[0].bookKeeper
    .connect(testSystem.repositoryContracts[0].controller)
    .addTokenToWatchlist(
      await testSystem.MockUSDC.getAddress(),
      await testSystem.usdcFeedWrapper.getAddress()
    );

  // Also add WETH to watchlist for price validation tests
  await testSystem.repositoryContracts[0].bookKeeper
    .connect(testSystem.repositoryContracts[0].controller)
    .addTokenToWatchlist(
      await testSystem.MockWETH.getAddress(),
      await testSystem.ethFeedWrapper.getAddress()
    );

  // Ensure includeExecutor defaults to false (tests will set to true as needed)
  await testSystem.repositoryContracts[0].bookKeeper
    .connect(testSystem.repositoryContracts[0].controller)
    .setIncludeExecutor(false);

  await testSystem.strandsAccount.connect(testSystem.deployer).mint(
    user.address,
    TEST_CONSTANTS.ACCOUNT_NFT.firmName,
    TEST_CONSTANTS.ACCOUNT_NFT.accountNumber,
    TEST_CONSTANTS.ACCOUNT_NFT.minBalance,
    TEST_CONSTANTS.ACCOUNT_NFT.maxBalance,
    TEST_CONSTANTS.ACCOUNT_NFT.maxDailyWithdraw,
    TEST_CONSTANTS.ACCOUNT_NFT.maxMonthlyWithdraw,
    timestamp
  );

  await testSystem.repositoryContracts[0].bookKeeper.setAccountNFT(
    await testSystem.strandsAccount.getAddress(),
    1
  );

  // Set repository controller as controller on StrandsAccount for AccountNFT value updates
  await testSystem.strandsAccount
    .connect(testSystem.deployer)
    .setIsController(await testSystem.repositoryContracts[0].controller.getAddress(), true);
}

// Helper function for standard bookkeeper initialization
async function initializeStandardBookKeeper(testSystem: any): Promise<void> {
  await testSystem.repositoryContracts[0].bookKeeper
    .connect(testSystem.deployer)
    .init(
      {
        feedname: toBytes32("USDC/USD"),
        feed: await testSystem.usdcFeedWrapper.getAddress(),
        priceInDecimals: toBN("1", 6),
        assetAddress: await testSystem.usdcFeedWrapper.getAddress(),
        decimals: 6,
      },
      await testSystem.repositoryContracts[0].repository.getAddress(),
      await testSystem.repositoryContracts[0].executor.getAddress()
    );
}

// Helper function to seed user with USDC for testing
export async function seedWithUSDC(user: SignerWithAddress): Promise<void> {
  const TEST_CONSTANTS = await getTestConstants();
  const amount = TEST_CONSTANTS.AMOUNTS.MOCK_USDC_LARGE_MINT;
  // Give the user permission to use ERC20 functions
  await hre.f.SC.MockUSDC.connect(hre.f.SC.repositoryContracts[0].owner).permitMint(user, true);
  await hre.f.SC.MockUSDC.connect(hre.f.SC.repositoryContracts[0].owner).mint(
    user,
    amount
  );
}

export async function approveAndDeposit(
  user: SignerWithAddress,
  amount: BigNumberish,
  processDeposit: boolean = false,
  depositAsset: DepositAsset = 'USDC',
  minOut: BigNumberish = 0
): Promise<void> {
  // Convert amount to BigInt to ensure proper arithmetic
  const amountBigInt = BigInt(amount.toString());

  const repoAddress = await hre.f.SC.repositoryContracts[0].repository.getAddress();

  // Determine which asset contract to use
  let assetContract, decimals;
  if (depositAsset === 'USDC') {
    assetContract = hre.f.SC.MockUSDC;
    decimals = 6;
  } else if (depositAsset === 'WETH') {
    assetContract = hre.f.SC.MockWETH;
    decimals = 18;
  } else if (depositAsset === 'API') {
    assetContract = hre.f.SC.strandsAPI;
    decimals = 6;
  } else {
    throw new Error(`Unsupported deposit asset: ${depositAsset}`);
  }

  // Check if user has enough of the asset, if not, mint some
  const userBalance = await assetContract.balanceOf(user.address);
  if (userBalance < amountBigInt) {
    if (depositAsset === 'API') {
      // For API (strandsAPI), use controller to mint
      await assetContract.connect(hre.f.SC.repositoryContracts[0].controller).mint(
        user.address,
        amountBigInt - userBalance
      );
    } else {
      // For USDC/WETH, use deployer to permit and mint
      const hasPermission = await assetContract.permitted(user.address);
      if (!hasPermission) {
        await assetContract.connect(hre.f.SC.deployer).permitMint(user.address, true);
      }

      // Mint the needed amount
      const neededAmount = amountBigInt - userBalance;
      await assetContract.connect(hre.f.SC.deployer).mint(user.address, neededAmount);
    }
  }

  // Approve the repository for the amount and deposit using user's own signer
  await assetContract.connect(user).approve(repoAddress, amountBigInt);

  // Initiate deposit using user's own signer
  await hre.f.SC.repositoryContracts[0].repository
    .connect(user)
    .initiateDeposit(amountBigInt, minOut);

  // Optionally process the deposit immediately
  if (processDeposit) {
    await hre.f.SC.repositoryContracts[0].repository
      .connect(hre.f.SC.repositoryContracts[0].controller)
      .processDeposits(1);
  }
}

export async function approveAndWithdraw(
  user: SignerWithAddress,
  amount: BigNumberish,
  processWithdrawal: boolean = false,
  minOut: BigNumberish = 0
): Promise<void> {
  // Convert amount to BigInt to ensure proper arithmetic
  const amountBigInt = BigInt(amount.toString());

  // Approve repository to spend user's repository tokens
  await hre.f.SC.repositoryContracts[0].repositoryToken
    .connect(user)
    .approve(
      hre.f.SC.repositoryContracts[0].repository.getAddress(),
      amountBigInt
    );

  // Initiate withdrawal using user's own signer
  await hre.f.SC.repositoryContracts[0].repository
    .connect(user)
    .initiateWithdraw(amountBigInt, minOut);

  // Optionally process the withdrawal immediately
  if (processWithdrawal) {
    await hre.f.SC.repositoryContracts[0].repository
      .connect(hre.f.SC.repositoryContracts[0].controller)
      .processWithdrawals(1);
  }
}

// Legacy function name for backward compatibility
export const deployFixture = setupTestSystem;

// Cache for deployed test systems to avoid redeployment
const testSystemCache = new Map<string, any>();

// Optimized fixture factory for common test configurations
export function createFixture(
  bookKeeperType: BookKeeperType = 'accountNFT',
  gateKeeperType: GateKeeperType = 'none',
  depositAsset: DepositAsset = 'USDC',
  useWalletExecutor: boolean = true,
  seedAmount: number = 0,
  feeRate: string = "0",
  setRepositoryToken: boolean = true
) {
  const cacheKey = `${bookKeeperType}-${gateKeeperType}-${depositAsset}-${useWalletExecutor}-${seedAmount}-${feeRate}-${setRepositoryToken}`;

  return async function deployContractsFixture() {
    // For now, just call setupTestSystem directly - caching can be added later
    return await setupTestSystem(
      bookKeeperType,
      gateKeeperType,
      depositAsset,
      useWalletExecutor,
      seedAmount,
      feeRate,
      setRepositoryToken
    );
  };
}

// Simple loadFixture replacement - just calls the fixture function
export async function loadFixture<T>(fixture: () => Promise<T>): Promise<T> {
  return await fixture();
}
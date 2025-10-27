import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import hre from "hardhat";
import chalk from "chalk";

// In Hardhat v3 with ESM, ethers is available through network.connect()
const { ethers } = await hre.network.connect();

import {
  RepositoryFactory,
  Repository,
  BookKeeper,
  RepositoryToken,
  TestERC20SetDecimals,
  GateKeeper,
  WhitelistGateKeeper,
  NFTGateKeeper,
  StrandsAccount,
  StrandsAPI,
  SimpleBookKeeper
} from "../../typechain-types";

import { DeploymentConfig, BOOK_KEEPER_TYPE, GATE_KEEPER_TYPE, OracleFeedConfig } from "../config/deploymentConfigs.js";
import { getOracleFeedAddresses, getFeedAddress, validateNetworkFeeds } from "../config/oracleFeedAddresses.js";
import {
  safeTransaction,
  safeContractDeploy,
  validateEnvironment,
  validateAddress,
  validateContractState,
  DeploymentLogger,
  DeploymentError
} from "../utils/deploymentUtils.js";
import { toBN } from "../utils/web3utils.js";
import { loadContractAddresses } from "../utils/loadContractAddresses.js";
import addressConfig from "../../config/index.js";

import repositoryFactoryABI from "../../artifacts/contracts/RepositoryFactory.sol/RepositoryFactory.json";
import DirectInputBookKeeperABI from "../../artifacts/contracts/BookKeepers/DirectInputBookKeeper.sol/DirectInputBookKeeper.json";
import AccountNFTBookKeeperABI from "../../artifacts/contracts/BookKeepers/AccountNFTBookKeeper.sol/AccountNFTBookKeeper.json";
import WhitelistGateKeeperABI from "../../artifacts/contracts/GateKeepers/WhitelistGateKeeper.sol/WhitelistGateKeeper.json";

// ============================================================================
// TYPES
// ============================================================================

export interface RealRepositoryContracts {
  repository: Repository;
  bookKeeper: BookKeeper;
  bookKeeperType: BOOK_KEEPER_TYPE;
  repositoryToken: RepositoryToken;
  executor: string;
  owner: SignerWithAddress;
  controller: SignerWithAddress;
  folderName: string;
  gateKeeper: WhitelistGateKeeper | NFTGateKeeper;
  gateKeeperType: GATE_KEEPER_TYPE;
}

export interface ProdSystemContracts {
  repositoryFactory: RepositoryFactory;
  repositoryContracts: RealRepositoryContracts[];
  MockUSDC?: TestERC20SetDecimals;
  MockWETH?: TestERC20SetDecimals;
  strandsAPI?: StrandsAPI;
  deployer: SignerWithAddress;
  chainId: string;
}

// ============================================================================
// BASE DEPLOYER CLASS
// ============================================================================

export abstract class BaseDeployer {
  protected deployerWallet: SignerWithAddress;
  protected controllerWallet: string;
  protected networkName: string;
  protected chainId: string;
  protected logger: DeploymentLogger;

  constructor(protected config: DeploymentConfig) {
    this.logger = new DeploymentLogger(13, config.name);
  }

  /**
   * Main deployment entry point
   */
  async deploy(): Promise<ProdSystemContracts> {
    console.log(chalk.cyan(`\n🚀 Starting deployment: ${this.config.name}\n`));

    // Step 1: Environment validation
    this.logger.step("Validating environment");
    const env = await validateEnvironment();
    this.deployerWallet = (await ethers.getSigners())[0];
    this.controllerWallet = env.controllerWallet;
    this.networkName = env.networkName;
    this.chainId = env.chainId;

    this.logger.info(`Deployer: ${env.deployerAddress}`);
    this.logger.info(`Controller: ${this.controllerWallet}`);
    this.logger.info(`Network: ${this.networkName} (${this.chainId})`);

    // Step 2: Deploy or connect to deposit assets
    this.logger.step("Setting up deposit assets");
    const depositAssets = await this.deployDepositAssets();

    // Step 3: Deploy RepositoryFactory
    this.logger.step("Deploying RepositoryFactory");
    const repositoryFactory = await this.deployRepositoryFactory(depositAssets.WETH);

    // Step 4: Deploy BookKeeper
    this.logger.step("Deploying BookKeeper");
    const bookKeeper = await this.deployBookKeeper();

    // Step 5: Deploy GateKeeper
    this.logger.step("Deploying GateKeeper");
    const gateKeeper = await this.deployGateKeeper();

    // Step 6: Deploy Repository
    this.logger.step("Creating Repository");
    const repository = await this.createRepository(repositoryFactory);

    // Step 7: Initialize Repository
    this.logger.step("Initializing Repository");
    await this.initializeRepository(repository, bookKeeper, gateKeeper, depositAssets);

    // Step 8: Deploy and link RepositoryToken
    // NOTE: Must happen BEFORE BookKeeper initialization because BookKeeper.init()
    // calls repository.repositoryToken() to cache the token address
    this.logger.step("Deploying RepositoryToken");
    const repositoryToken = await this.deployRepositoryToken(repository, gateKeeper);

    // Step 9: Initialize BookKeeper
    // NOTE: Must happen AFTER RepositoryToken is linked to avoid caching address(0)
    this.logger.step("Initializing BookKeeper");
    await this.initializeBookKeeper(bookKeeper, repository);

    // Step 10: Configure Oracle Feeds
    this.logger.step("Configuring oracle feeds");
    await this.configureOracleFeeds(bookKeeper, depositAssets);

    // Step 11: Setup ownership and permissions
    this.logger.step("Setting up ownership and permissions");
    await this.setupOwnershipAndPermissions(repositoryFactory, repository, gateKeeper, bookKeeper, repositoryToken);

    // Step 12: Final validation
    this.logger.step("Validating deployment");
    await this.validateDeployment(repository, repositoryToken, bookKeeper);

    // Step 13: Return contracts
    this.logger.step("Deployment complete");
    return this.buildProdSystemContracts(
      repositoryFactory,
      repository,
      repositoryToken,
      bookKeeper,
      gateKeeper,
      depositAssets
    );
  }

  // ============================================================================
  // DEPLOYMENT STEPS
  // ============================================================================

  private async deployDepositAssets(): Promise<{
    USDC?: TestERC20SetDecimals;
    WETH?: TestERC20SetDecimals;
    strandsAPI?: StrandsAPI;
  }> {
    const assets: any = {};
    const networkAddresses = addressConfig[this.networkName] || {};

    // Deploy or connect to USDC
    if (this.config.depositAsset === "USDC" || this.needsUSDCForFees()) {
      if (networkAddresses.usdcAddress) {
        this.logger.info(`Using existing USDC: ${networkAddresses.usdcAddress}`);
        assets.USDC = new ethers.Contract(
          networkAddresses.usdcAddress,
          (await ethers.getContractFactory("TestERC20SetDecimals")).interface,
          this.deployerWallet
        ) as TestERC20SetDecimals;
      } else {
        assets.USDC = await safeContractDeploy<TestERC20SetDecimals>(
          "TestERC20SetDecimals",
          ["USDC", "USDC", 6],
          "Mock USDC"
        );
      }
    }

    // Deploy or connect to WETH (always needed for RepositoryFactory)
    if (networkAddresses.wethAddress) {
      this.logger.info(`Using existing WETH: ${networkAddresses.wethAddress}`);
      assets.WETH = new ethers.Contract(
        networkAddresses.wethAddress,
        (await ethers.getContractFactory("TestERC20SetDecimals")).interface,
        this.deployerWallet
      ) as TestERC20SetDecimals;
    } else {
      assets.WETH = await safeContractDeploy<TestERC20SetDecimals>(
        "TestERC20SetDecimals",
        ["WETH", "WETH", 18],
        "Mock WETH"
      );
    }

    // Deploy StrandsAPI if needed
    if (this.config.depositAsset === "API") {
      assets.strandsAPI = await safeContractDeploy<StrandsAPI>(
        "StrandsAPI",
        [
          await this.deployerWallet.getAddress(),
          this.controllerWallet
        ],
        "StrandsAPI Token"
      );
    }

    return assets;
  }

  private async deployRepositoryFactory(weth: TestERC20SetDecimals): Promise<RepositoryFactory> {
    const existingAddresses = loadContractAddresses(this.config.folderName, this.chainId);

    if (existingAddresses.repositoryFactoryAddress) {
      this.logger.info(`Using existing RepositoryFactory: ${existingAddresses.repositoryFactoryAddress}`);
      return new ethers.Contract(
        existingAddresses.repositoryFactoryAddress,
        repositoryFactoryABI.abi,
        this.deployerWallet
      ) as RepositoryFactory;
    }

    const factory = await safeContractDeploy<RepositoryFactory>(
      "RepositoryFactory",
      [
        await this.deployerWallet.getAddress(),
        await this.deployerWallet.getAddress(),
        await weth.getAddress()
      ],
      "RepositoryFactory"
    );

    return factory;
  }

  private async deployBookKeeper(): Promise<BookKeeper> {
    const existingAddresses = loadContractAddresses(this.config.folderName, this.chainId);

    if (existingAddresses.bookKeeperAddress) {
      this.logger.info(`Using existing BookKeeper: ${existingAddresses.bookKeeperAddress}`);

      const abiMap = {
        [BOOK_KEEPER_TYPE.DIRECT_INPUT_BOOK_KEEPER]: DirectInputBookKeeperABI.abi,
        [BOOK_KEEPER_TYPE.ACCOUNT_NFT_BOOK_KEEPER]: AccountNFTBookKeeperABI.abi,
        [BOOK_KEEPER_TYPE.SIMPLE_BOOK_KEEPER]: DirectInputBookKeeperABI.abi // SimpleBookKeeper uses same interface
      };

      return new ethers.Contract(
        existingAddresses.bookKeeperAddress,
        abiMap[this.config.bookKeeperType],
        this.deployerWallet
      ) as BookKeeper;
    }

    const contractMap = {
      [BOOK_KEEPER_TYPE.DIRECT_INPUT_BOOK_KEEPER]: "DirectInputBookKeeper",
      [BOOK_KEEPER_TYPE.ACCOUNT_NFT_BOOK_KEEPER]: "AccountNFTBookKeeper",
      [BOOK_KEEPER_TYPE.SIMPLE_BOOK_KEEPER]: "SimpleBookKeeper"
    };

    return await safeContractDeploy<BookKeeper>(
      contractMap[this.config.bookKeeperType],
      [],
      `${this.config.bookKeeperType} BookKeeper`
    );
  }

  private async deployGateKeeper(): Promise<WhitelistGateKeeper | NFTGateKeeper> {
    const existingAddresses = loadContractAddresses(this.config.folderName, this.chainId);

    if (existingAddresses.gateKeeperAddress) {
      this.logger.info(`Using existing GateKeeper: ${existingAddresses.gateKeeperAddress}`);
      return new ethers.Contract(
        existingAddresses.gateKeeperAddress,
        WhitelistGateKeeperABI.abi,
        this.deployerWallet
      ) as WhitelistGateKeeper;
    }

    const contractMap = {
      [GATE_KEEPER_TYPE.WHITELIST_GATE_KEEPER]: "WhitelistGateKeeper",
      [GATE_KEEPER_TYPE.NFT_GATE_KEEPER]: "NFTGateKeeper",
      [GATE_KEEPER_TYPE.NONE]: "WhitelistGateKeeper" // Default fallback
    };

    return await safeContractDeploy<WhitelistGateKeeper | NFTGateKeeper>(
      contractMap[this.config.gateKeeperType],
      [],
      `${this.config.gateKeeperType} GateKeeper`
    );
  }

  private async createRepository(repositoryFactory: RepositoryFactory): Promise<Repository> {
    const existingAddresses = loadContractAddresses(this.config.folderName, this.chainId);

    if (existingAddresses.repositoryAddress) {
      this.logger.info(`Using existing Repository: ${existingAddresses.repositoryAddress}`);
      return new ethers.Contract(
        existingAddresses.repositoryAddress,
        (await ethers.getContractFactory("Repository")).interface,
        this.deployerWallet
      ) as Repository;
    }

    // Ensure deployer is a controller on RepositoryFactory to create repository
    const deployerAddress = await this.deployerWallet.getAddress();
    const isController = await repositoryFactory.isController(deployerAddress);
    if (!isController) {
      await safeTransaction(
        repositoryFactory.connect(this.deployerWallet).setIsController(deployerAddress, true),
        "Setting deployer as RepositoryFactory controller"
      );
    }

    const receipt = await safeTransaction(
      repositoryFactory.connect(this.deployerWallet).createRepository(
        deployerAddress,
        deployerAddress
      ),
      "Creating Repository via Factory"
    );

    // Extract repository address from logs
    const repositoryAddress = receipt.logs[receipt.logs.length - 1]?.args?.[0];
    if (!repositoryAddress) {
      throw new DeploymentError("Repository creation", "Failed to extract repository address from logs", new Error("No repository address in logs"));
    }

    validateAddress(repositoryAddress, "Created Repository");

    return new ethers.Contract(
      repositoryAddress,
      (await ethers.getContractFactory("Repository")).interface,
      this.deployerWallet
    ) as Repository;
  }

  private async initializeRepository(
    repository: Repository,
    bookKeeper: BookKeeper,
    gateKeeper: WhitelistGateKeeper | NFTGateKeeper,
    depositAssets: any
  ): Promise<void> {
    const existingBookKeeper = await repository.bookKeeper();
    if (existingBookKeeper !== ethers.ZeroAddress) {
      this.logger.info("Repository already initialized");
      return;
    }

    let depositAssetAddress: string;
    switch (this.config.depositAsset) {
      case "USDC":
        depositAssetAddress = await depositAssets.USDC!.getAddress();
        break;
      case "WETH":
        depositAssetAddress = await depositAssets.WETH!.getAddress();
        break;
      case "API":
        depositAssetAddress = await depositAssets.strandsAPI!.getAddress();
        break;
      default:
        throw new DeploymentError("Repository initialization", `Unknown deposit asset: ${this.config.depositAsset}`, new Error("Invalid deposit asset"));
    }

    await safeTransaction(
      repository.connect(this.deployerWallet).init(
        this.controllerWallet,
        await bookKeeper.getAddress(),
        await gateKeeper.getAddress(),
        depositAssetAddress,
        BigInt(this.config.totalValueCap18),
        toBN(this.config.licensingFeeRate)
      ),
      "Initializing Repository"
    );
  }

  private async initializeBookKeeper(bookKeeper: BookKeeper, repository: Repository): Promise<void> {
    // Check if already initialized
    try {
      const existingRepo = await bookKeeper.repository();
      if (existingRepo !== ethers.ZeroAddress) {
        if (existingRepo === await repository.getAddress()) {
          this.logger.info("BookKeeper already initialized with this Repository");
        } else {
          this.logger.info(`BookKeeper already initialized with different Repository: ${existingRepo}`);
          this.logger.warn("Skipping BookKeeper initialization - contract is already in use");
        }
        return;
      }
    } catch {
      // BookKeeper not initialized, proceed
    }

    await safeTransaction(
      bookKeeper.connect(this.deployerWallet).init(await repository.getAddress()),
      "Initializing BookKeeper"
    );

    await safeTransaction(
      bookKeeper.connect(this.deployerWallet).setAcceptableMarginOfError(toBN("0.00001")),
      "Setting BookKeeper margin of error"
    );

    // Additional setup for AccountNFT BookKeeper
    if (this.config.bookKeeperType === BOOK_KEEPER_TYPE.ACCOUNT_NFT_BOOK_KEEPER && this.config.accountNFTTokenId) {
      const networkAddresses = addressConfig[this.networkName] || {};
      if (networkAddresses.accountNFTAddress) {
        await safeTransaction(
          bookKeeper.setAccountNFT(networkAddresses.accountNFTAddress, this.config.accountNFTTokenId),
          "Setting AccountNFT in BookKeeper"
        );
      } else {
        this.logger.warn("AccountNFT address not found, will need to be set manually");
      }
    }

    // Set executor inclusion if configured
    if (this.config.includeExecutorInAUM) {
      await safeTransaction(
        bookKeeper.connect(this.deployerWallet).setIncludeExecutor(true),
        "Enabling executor inclusion in AUM"
      );
    }
  }

  private async deployRepositoryToken(
    repository: Repository,
    gateKeeper: WhitelistGateKeeper | NFTGateKeeper
  ): Promise<RepositoryToken> {
    const existingTokenAddress = await repository.repositoryToken();

    if (existingTokenAddress !== ethers.ZeroAddress) {
      this.logger.info(`Using existing RepositoryToken: ${existingTokenAddress}`);
      return new ethers.Contract(
        existingTokenAddress,
        (await ethers.getContractFactory("RepositoryToken")).interface,
        this.deployerWallet
      ) as RepositoryToken;
    }

    const repositoryToken = await safeContractDeploy<RepositoryToken>(
      "RepositoryToken",
      [
        this.config.name,
        this.config.symbol,
        await gateKeeper.getAddress(),
        await repository.getAddress()
      ],
      "RepositoryToken"
    );

    await safeTransaction(
      repository.connect(this.deployerWallet).setRepositoryToken(await repositoryToken.getAddress()),
      "Linking RepositoryToken to Repository"
    );

    return repositoryToken;
  }

  private async setupOwnershipAndPermissions(
    repositoryFactory: RepositoryFactory,
    repository: Repository,
    gateKeeper: WhitelistGateKeeper | NFTGateKeeper,
    bookKeeper: BookKeeper,
    repositoryToken: RepositoryToken
  ): Promise<void> {
    // Set up RepositoryFactory permissions
    try {
      const isController = await repositoryFactory.isController(this.controllerWallet);
      if (!isController) {
        await safeTransaction(
          repositoryFactory.connect(this.deployerWallet).setIsController(this.controllerWallet, true),
          "Setting RepositoryFactory controller"
        );
      } else {
        this.logger.info("RepositoryFactory controller already set");
      }

      const currentOwner = await repositoryFactory.owner();
      if (currentOwner !== this.controllerWallet) {
        await safeTransaction(
          repositoryFactory.connect(this.deployerWallet).nominateNewOwner(this.controllerWallet),
          "Nominating new RepositoryFactory owner"
        );
      } else {
        this.logger.info("RepositoryFactory owner already set");
      }
    } catch (error) {
      this.logger.warn(`RepositoryFactory ownership setup failed: ${(error as Error).message}`);
    }

    // Set up Repository permissions
    try {
      const isController = await repository.isController(this.controllerWallet);
      if (!isController) {
        await safeTransaction(
          repository.connect(this.deployerWallet).setIsController(this.controllerWallet, true),
          "Setting Repository controller"
        );
      } else {
        this.logger.info("Repository controller already set");
      }

      const currentOwner = await repository.owner();
      if (currentOwner !== this.controllerWallet) {
        await safeTransaction(
          repository.connect(this.deployerWallet).nominateNewOwner(this.controllerWallet),
          "Nominating new Repository owner"
        );
      } else {
        this.logger.info("Repository owner already set");
      }
    } catch (error) {
      this.logger.warn(`Repository ownership setup failed: ${(error as Error).message}`);
    }

    // Set up GateKeeper permissions
    try {
      if (this.config.gateKeeperType === GATE_KEEPER_TYPE.WHITELIST_GATE_KEEPER) {
        const whitelistGK = gateKeeper as WhitelistGateKeeper;
        const isEnabled = await whitelistGK.depositWhitelistEnabled();
        if (!isEnabled) {
          await safeTransaction(
            whitelistGK.connect(this.deployerWallet).setDepositWhitelistEnabled(true),
            "Enabling deposit whitelist"
          );
        } else {
          this.logger.info("Deposit whitelist already enabled");
        }
      }

      const isController = await gateKeeper.isController(this.controllerWallet);
      if (!isController) {
        await safeTransaction(
          gateKeeper.connect(this.deployerWallet).setIsController(this.controllerWallet, true),
          "Setting GateKeeper controller"
        );
      } else {
        this.logger.info("GateKeeper controller already set");
      }

      const currentOwner = await gateKeeper.owner();
      if (currentOwner !== this.controllerWallet) {
        await safeTransaction(
          gateKeeper.connect(this.deployerWallet).nominateNewOwner(this.controllerWallet),
          "Nominating new GateKeeper owner"
        );
      } else {
        this.logger.info("GateKeeper owner already set");
      }
    } catch (error) {
      this.logger.warn(`GateKeeper ownership setup failed: ${(error as Error).message}`);
    }

    // Set up BookKeeper permissions
    try {
      const currentOwner = await bookKeeper.owner();
      if (currentOwner !== this.controllerWallet) {
        await safeTransaction(
          bookKeeper.connect(this.deployerWallet).nominateNewOwner(this.controllerWallet),
          "Nominating new BookKeeper owner"
        );
      } else {
        this.logger.info("BookKeeper owner already set");
      }
    } catch (error) {
      this.logger.warn(`BookKeeper ownership setup failed: ${(error as Error).message}`);
    }

    // Note: RepositoryToken does not use Owned pattern - it uses repository address directly
  }

  private async validateDeployment(
    repository: Repository,
    repositoryToken: RepositoryToken,
    bookKeeper: BookKeeper
  ): Promise<void> {
    // Validate Repository state
    await validateContractState(
      repository,
      {
        executor: this.controllerWallet,
        bookKeeper: await bookKeeper.getAddress(),
        repositoryToken: await repositoryToken.getAddress()
      },
      "Repository"
    );

    // Validate RepositoryToken state
    await validateContractState(
      repositoryToken,
      {
        repository: await repository.getAddress(),
        name: this.config.name,
        symbol: this.config.symbol
      },
      "RepositoryToken"
    );

    // Validate BookKeeper state
    await validateContractState(
      bookKeeper,
      {
        repository: await repository.getAddress()
      },
      "BookKeeper"
    );

    this.logger.success("All deployment validations passed");
  }

  private buildProdSystemContracts(
    repositoryFactory: RepositoryFactory,
    repository: Repository,
    repositoryToken: RepositoryToken,
    bookKeeper: BookKeeper,
    gateKeeper: WhitelistGateKeeper | NFTGateKeeper,
    depositAssets: any
  ): ProdSystemContracts {
    const repositoryContract: RealRepositoryContracts = {
      repository,
      bookKeeper,
      bookKeeperType: this.config.bookKeeperType,
      repositoryToken,
      executor: this.controllerWallet,
      owner: this.deployerWallet,
      controller: this.deployerWallet,
      folderName: this.config.folderName,
      gateKeeper,
      gateKeeperType: this.config.gateKeeperType
    };

    return {
      repositoryFactory,
      repositoryContracts: [repositoryContract],
      MockUSDC: depositAssets.USDC,
      MockWETH: depositAssets.WETH,
      strandsAPI: depositAssets.strandsAPI,
      deployer: this.deployerWallet,
      chainId: this.chainId
    };
  }

  // ============================================================================
  // ORACLE FEED CONFIGURATION
  // ============================================================================

  private async configureOracleFeeds(
    bookKeeper: BookKeeper,
    depositAssets: any
  ): Promise<void> {
    this.logger.info(`Configuring ${this.config.oracleFeeds.length} oracle feed(s)`);

    for (const feedConfig of this.config.oracleFeeds) {
      this.logger.info(`Setting up ${feedConfig.description}`);

      // Resolve token address
      const tokenAddress = await this.resolveTokenAddress(feedConfig.tokenSymbol, depositAssets);

      // Check if token is already on watchlist
      try {
        const existingFeed = await bookKeeper.tokenAddress2feedAddress(tokenAddress);
        if (existingFeed !== ethers.ZeroAddress) {
          this.logger.info(`${feedConfig.tokenSymbol} already on watchlist with feed: ${existingFeed}`);
          this.logger.success(`✓ ${feedConfig.tokenSymbol} oracle feed already configured`);
          continue;
        }
      } catch (error) {
        // Token not on watchlist or error reading, proceed to add
      }

      // Deploy or resolve feed address
      const feedAddress = await this.resolveFeedAddress(feedConfig);

      // Add token to watchlist
      await safeTransaction(
        bookKeeper.connect(this.deployerWallet).addTokenToWatchlist(tokenAddress, feedAddress),
        `Adding ${feedConfig.tokenSymbol} to watchlist with feed`
      );

      this.logger.success(`✓ ${feedConfig.tokenSymbol} oracle feed configured`);
    }
  }

  private async resolveTokenAddress(tokenSymbol: string, depositAssets: any): Promise<string> {
    switch (tokenSymbol) {
      case "USDC":
        return await depositAssets.USDC.getAddress();
      case "WETH":
        return await depositAssets.WETH.getAddress();
      case "API":
        if (!depositAssets.strandsAPI) {
          throw new DeploymentError("Oracle configuration", "StrandsAPI",
            new Error("StrandsAPI not deployed but required for API feed"));
        }
        return await depositAssets.strandsAPI.getAddress();
      default:
        throw new DeploymentError("Oracle configuration", "Token resolution",
          new Error(`Unknown token symbol: ${tokenSymbol}`));
    }
  }

  private async resolveFeedAddress(feedConfig: OracleFeedConfig): Promise<string> {
    switch (feedConfig.feedType) {
      case "NETWORK_FEED":
        // Validate network feeds are available
        validateNetworkFeeds(this.chainId);

        const feedAddresses = getOracleFeedAddresses(this.chainId);
        const feedAddress = feedAddresses[feedConfig.networkFeedSymbol!];

        if (!feedAddress) {
          throw new DeploymentError("Oracle configuration", "Network feed",
            new Error(`${feedConfig.networkFeedSymbol} feed not available for ${feedAddresses.networkName}`));
        }

        validateAddress(feedAddress, `${feedConfig.networkFeedSymbol} feed address`);
        this.logger.info(`Using ${feedConfig.networkFeedSymbol} feed on ${feedAddresses.networkName}: ${feedAddress}`);
        return feedAddress;

      case "CONSTANT_FEED":
        this.logger.info(`Deploying ConstantPriceFeed with price: $${
          parseInt(feedConfig.constantPrice!) / 100000000
        }`);
        const constantFeed = await safeContractDeploy(
          "ConstantPriceFeed",
          [this.controllerWallet, this.controllerWallet],
          `ConstantPriceFeed for ${feedConfig.tokenSymbol}`
        );

        // Note: ConstantPriceFeed has hardcoded price of $1.00 (1e8)
        // No setPrice() method available

        return await constantFeed.getAddress();

      case "DEPLOYED_FEED":
        throw new DeploymentError("Oracle configuration", "Feed deployment",
          new Error("DEPLOYED_FEED type not yet implemented"));

      default:
        throw new DeploymentError("Oracle configuration", "Feed type",
          new Error(`Unknown feed type: ${feedConfig.feedType}`));
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private needsUSDCForFees(): boolean {
    return parseFloat(this.config.licensingFeeRate) > 0;
  }
}
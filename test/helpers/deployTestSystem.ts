// Get ethers through hardhat runtime
import hardhat from "hardhat";

// Ethers will be injected by caller
let ethers: any;
import {
  StrandsAccount,
  StrandsPosition,
  DirectInputBookKeeper,
  AccountNFTBookKeeper,
  SimpleBookKeeper,
  Repository,
  RepositoryFactory,
  RepositoryToken,
  TestERC20SetDecimals,
  Executor,
  MockAggregatorV2V3,
  WhitelistGateKeeper,
  Strands250,
  StrandsAPI,
  NFTGateKeeper,
  CallBackGateKeeper
} from "../../typechain-types/index.ts";

import { Signer } from "ethers";

// Define SignerWithAddress locally since the export is not available in ESM
interface SignerWithAddress extends Signer {
  address: string;
}
// Removed circular import - initialiseContracts will be called from setupTestSystem
import { toBN } from "../helpers/testUtils.js";
import { getTestConstants } from "./testConstants.js";

async function deployTestERC20(name: string, symbol: string, decimals: number): Promise<TestERC20SetDecimals> {
  return (await (
    await ethers.deployContract("TestERC20SetDecimals", [name, symbol, decimals])
  ).waitForDeployment()) as unknown as TestERC20SetDecimals;
}

async function deployMockAggregator(owner: SignerWithAddress): Promise<MockAggregatorV2V3> {
  return (await (
    await ethers.getContractFactory("MockAggregatorV2V3")
  ).connect(owner).deploy()) as MockAggregatorV2V3;
}

// ChainlinkAdapter is no longer needed - using Chainlink feeds directly!

async function deployConstantPriceFeed(owner: SignerWithAddress, controller: SignerWithAddress): Promise<any> {
  return (await (
    await ethers.getContractFactory("ConstantPriceFeed")
  ).connect(owner).deploy(owner.address, controller.address)) as any;
}

async function deployExecutor(useWallet?: boolean): Promise<Executor | SignerWithAddress> {
  if (useWallet) {
    return (await ethers.getSigners())[4];
  }
  return (await (
    await ethers.deployContract("Executor")
  ).waitForDeployment()) as unknown as Executor;
}


export type testRepositoryContracts = {
  repository: Repository;
  bookKeeper: BookKeeper | DirectInputBookKeeper | AccountNFTBookKeeper | SimpleBookKeeper;
  repositoryToken: RepositoryToken;
  executor: Executor | SignerWithAddress;
  owner: SignerWithAddress;
  controller: SignerWithAddress;
  feeRecipient: SignerWithAddress;
};

 
export type testSystemContracts = {
  repositoryFactory: RepositoryFactory;
  repositoryContracts: testRepositoryContracts[];
  MockUSDC: TestERC20SetDecimals;
  MockWETH: TestERC20SetDecimals;
  ethFeed: MockAggregatorV2V3;
  USDCFeed: MockAggregatorV2V3;
  apiFeed: any; // ConstantPriceFeed
  ethFeedWrapper: MockAggregatorV2V3; // Direct Chainlink feed
  usdcFeedWrapper: MockAggregatorV2V3; // Direct Chainlink feed
  apiFeedWrapper: any; // ConstantPriceFeed (AggregatorV3Interface)
  bob: SignerWithAddress;
  deployer: SignerWithAddress;
  controller: SignerWithAddress;
  strandsAccount: StrandsAccount;
  strandsPosition: StrandsPosition;
  strands250: Strands250;
  gateKeeper: WhitelistGateKeeper | NFTGateKeeper | CallBackGateKeeper | undefined;
  strandsAPI: StrandsAPI;
};

export async function deployTestSystem(
  bookKeeperType: 'simple' | 'directInput' | 'accountNFT' = 'simple',
  gateKeeperType: 'none' | 'whitelist' | 'nft' | 'callback' = 'none',
  depositAsset: 'USDC' | 'WETH' | 'API' = 'USDC',
  useWalletExecutor: boolean = true,
  feeRate: string = "0",
  ethersInstance?: any, // Accept ethers instance from caller
  setRepositoryToken: boolean = true
): Promise<testSystemContracts> {
  // Use provided ethers instance or get from network connection
  if (ethersInstance) {
    ethers = ethersInstance;
  } else {
    const { ethers: networkEthers } = await hardhat.network.connect();
    ethers = networkEthers;
  }

  const [owner, controller, bob, factoryController] =
    await ethers.getSigners(); // deployer=0, alice=6, bob=2

  // Load test constants
  const TEST_CONSTANTS = await getTestConstants();

  // Deploy ERC20s
  const mockUSDC = await deployTestERC20(
    TEST_CONSTANTS.TOKENS.USDC.name,
    TEST_CONSTANTS.TOKENS.USDC.symbol,
    TEST_CONSTANTS.TOKENS.USDC.decimals
  );

  const mockWETH = await deployTestERC20(
    TEST_CONSTANTS.TOKENS.WETH.name,
    TEST_CONSTANTS.TOKENS.WETH.symbol,
    TEST_CONSTANTS.TOKENS.WETH.decimals
  );

  const strandsAPI = (await (
    await ethers.deployContract("StrandsAPI", [owner.address, controller.address])
  ).waitForDeployment()) as unknown as StrandsAPI;

  // Deploy mock Chainlink feeds
  const ethMockAggregator = await deployMockAggregator(owner);
  const usdcMockAggregator = await deployMockAggregator(owner);
  await usdcMockAggregator.setDecimals(TEST_CONSTANTS.PRICE_FEEDS.USDC_DECIMALS);

  // Set initial prices for mock feeds
  await ethMockAggregator.setLatestAnswer(260000000000, Math.floor(Date.now() / 1000)); // $2600 ETH with 8 decimals
  await usdcMockAggregator.setLatestAnswer(100000000, Math.floor(Date.now() / 1000)); // $1.00 USDC with 8 decimals

  // Deploy constant price feed for API (always returns $1.00)
  const apiConstantFeed = await deployConstantPriceFeed(owner, controller);

  // Use Chainlink feeds directly - no more wrappers needed!
  const ethFeedWrapper = ethMockAggregator;
  const usdcFeedWrapper = usdcMockAggregator;
  const apiFeedWrapper = apiConstantFeed;


  // Deploy the RepositoryFactory contract
  const repositoryFactory = (await (
    await ethers.deployContract("RepositoryFactory", [
      owner.address,
      factoryController.address,
      await mockWETH.getAddress()
    ])
  ).waitForDeployment()) as unknown as RepositoryFactory;

  // Deploy a single bookKeeper for the repository - default to AccountNFTBookKeeper
  let newBookKeeper = (await (await ethers.deployContract("AccountNFTBookKeeper")).waitForDeployment()) as unknown as AccountNFTBookKeeper;

  // Deploy BookKeeper based on type
  if (bookKeeperType === 'accountNFT') {
    newBookKeeper = (await (
      await ethers.deployContract("AccountNFTBookKeeper")
    ).waitForDeployment()) as unknown as AccountNFTBookKeeper;
  } else if (bookKeeperType === 'directInput') {
    newBookKeeper = (await (
      await ethers.deployContract("DirectInputBookKeeper")
    ).waitForDeployment()) as unknown as DirectInputBookKeeper;
  } else if (bookKeeperType === 'simple') {
    newBookKeeper = (await (
      await ethers.deployContract("SimpleBookKeeper")
    ).waitForDeployment()) as unknown as SimpleBookKeeper;
  } else {
    console.log("Use BookKeeper?")
  }

  // Deploy Strands250 NFT
  const strands250 = (await (await ethers.deployContract("Strands250", [
    TEST_CONSTANTS.STRANDS_250.name,
    TEST_CONSTANTS.STRANDS_250.symbol,
    TEST_CONSTANTS.STRANDS_250.maxSupply,
    TEST_CONSTANTS.STRANDS_250.baseUri
  ])).waitForDeployment()) as unknown as Strands250;

  // Deploy gatekeeper based on type
  let gateKeeper: WhitelistGateKeeper | NFTGateKeeper | CallBackGateKeeper | undefined;
  let gateKeeperAddress: string = TEST_CONSTANTS.ZERO_ADDRESS;

  if (gateKeeperType === 'whitelist') {
    gateKeeper = (await (
      await ethers.deployContract("WhitelistGateKeeper")
    ).waitForDeployment()) as unknown as WhitelistGateKeeper;
    // Whitelist the test users to canDeposit and canTransferRepositoryToken
    await gateKeeper.setUserCanDeposit([
      owner,
      (await ethers.getSigners())[6].address, // alice
      (await ethers.getSigners())[10].address, // another test user
      bob,
    ]);
    await gateKeeper.setDepositWhitelistEnabled(true);
    gateKeeperAddress = await gateKeeper.getAddress()
  } else if (gateKeeperType === 'nft') {
    gateKeeper = (await (
      await ethers.deployContract("NFTGateKeeper", [await strands250.getAddress()])
    ).waitForDeployment()) as unknown as NFTGateKeeper;
    await gateKeeper.setDepositWhitelistEnabled(true);
    gateKeeperAddress = await gateKeeper.getAddress()
  } else if (gateKeeperType === 'callback') {
    gateKeeper = (await (
      await ethers.deployContract("CallBackGateKeeper", [
        await owner.getAddress(),
        await controller.getAddress()
      ])
    ).waitForDeployment()) as unknown as CallBackGateKeeper;
    gateKeeperAddress = await gateKeeper.getAddress()
  }

  // deploy contract or use a wallet
  let executor: any;
  if (useWalletExecutor) {
    // get a signer to be wallet executor
    executor = (await ethers.getSigners())[4];
  } else {
    // deploy single executor contract to mimic on-chain strategy
    executor = await (await (
      await ethers.deployContract("Executor")
    ).waitForDeployment()) as unknown as Executor;
  }


  // Select deposit asset based on parameter
  let depositAssetContract
  if (depositAsset === 'WETH') {
    depositAssetContract = mockWETH
  } else if (depositAsset === 'API') {
    depositAssetContract = strandsAPI
  } else {
    depositAssetContract = mockUSDC
  }
  // deploy single repository
  await repositoryFactory
    .connect(factoryController)
    .createRepository(
      owner.address,
      controller.address
    );
  const reponumber = await repositoryFactory.repositoryCount()

  // getting the deployed subcontracts.
  const deployedRepositories = await repositoryFactory.deployedRepositories(parseInt(reponumber.toString()) - 1);

  const newRepository = new ethers.Contract(
    deployedRepositories,
    (await ethers.getContractFactory("Repository")).interface,
    await ethers.provider.getSigner()
  ) as unknown as Repository;

  await newRepository.connect(owner).init(
    await executor.getAddress(),
    await newBookKeeper.getAddress(),
    gateKeeperAddress,
    await depositAssetContract.getAddress(),
    toBN("100000000"),
    toBN(feeRate)
  );

  // Create RepositoryToken separately and set it
  const newRepositoryToken = await (await ethers.deployContract("RepositoryToken", [
    "StrandsRepositoryToken",
    "STK1",
    gateKeeperAddress,
    await newRepository.getAddress()
  ])).waitForDeployment();

  if (setRepositoryToken) {
    await newRepository.connect(owner).setRepositoryToken(await newRepositoryToken.getAddress());
    await newRepository.connect(controller).setDepositEnabled(true);
    await newRepository.connect(controller).setWithdrawEnabled(true);
  }

  // Note: Deposit asset feed configuration is handled in setupTestSystem.ts
  // based on the specific BookKeeper type

  // getting the deployed repositoryToken from the repository.
  const repositoryTokenAddress = await newRepository.repositoryToken();
  const repositoryToken = new ethers.Contract(
    repositoryTokenAddress,
    (await ethers.getContractFactory("RepositoryToken")).interface,
    await ethers.provider.getSigner()
  ) as unknown as RepositoryToken;

  const feeRecipient = (await ethers.getSigners())[10];
  // set fee recipient
  await repositoryFactory.connect(owner).setFeeRecipient(feeRecipient.address);

  const strandsAccount = (await (
    await ethers.deployContract("StrandsAccount", [
      "Strands Account NFT",
      "SA",
      "https://pin.ski/41aSODW",
    ])
  ).waitForDeployment()) as unknown as StrandsAccount;

  const strandsPosition = (await (
    await ethers.deployContract("StrandsPosition", [
      "Strands Position NFT",
      "SP",
      "https://pin.ski/41aSODW",
    ])
  ).waitForDeployment()) as unknown as StrandsPosition;

  await strandsPosition.setIsController(
    await strandsAccount.getAddress(),
    true
  );
  await strandsAccount.setPositionNFT(await strandsPosition.getAddress());

  return {
    repositoryFactory: repositoryFactory as RepositoryFactory,
    MockUSDC: mockUSDC,
    MockWETH: mockWETH,
    bob: bob as any,
    deployer: owner as any,
    controller: factoryController as any,
    ethFeed: ethMockAggregator,
    USDCFeed: usdcMockAggregator,
    apiFeed: apiConstantFeed,
    ethFeedWrapper: ethFeedWrapper, // Direct Chainlink ETH feed
    usdcFeedWrapper: usdcFeedWrapper, // Direct Chainlink USDC feed
    apiFeedWrapper: apiFeedWrapper,
    repositoryContracts: [
      {
        repository: newRepository,
        bookKeeper: newBookKeeper,
        repositoryToken: repositoryToken,
        owner: owner as any,
        controller: controller as any,
        executor: executor as any,
        feeRecipient: feeRecipient as any,
      },
    ],
    strandsAccount,
    strandsPosition,
    strands250,
    gateKeeper: gateKeeper,
    strandsAPI,
  } as testSystemContracts;
}

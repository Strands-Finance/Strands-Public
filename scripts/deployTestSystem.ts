import { ethers } from "hardhat";
import {
  StrandsAccount,
  StrandsPosition,
  DirectInputBookKeeper,
  AccountNFTBookKeeper,
  SimpleBookKeeper,
  BookKeeper,
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
} from "../typechain-types";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { initialiseContracts } from "./seedTestSystem";
import { toBN } from "./utils/web3utils";
import chalk from "chalk";

export type testRepositoryContracts = {
  repository: Repository;
  bookKeeper: BookKeeper | DirectInputBookKeeper | AccountNFTBookKeeper | SimpleBookKeeper;
  repositoryToken: RepositoryToken;
  executor: Executor;
  owner: SignerWithAddress;
  controller: SignerWithAddress;
  feeRecipient: SignerWithAddress;
};

// only global contracts, e.g weth, and the feeds should be in here.
export type testSystemContracts = {
  repositoryFactory: RepositoryFactory;
  repositoryContracts: testRepositoryContracts[];
  MockUSDC: TestERC20SetDecimals;
  MockWETH: TestERC20SetDecimals;
  ethFeed: MockAggregatorV2V3;
  USDCFeed: MockAggregatorV2V3;
  ethFeedWrapper: Contract;
  usdcFeedWrapper: Contract;
  userAccount: SignerWithAddress;
  deployer: SignerWithAddress;
  controller: SignerWithAddress;
  strandsAccount: StrandsAccount;
  strandsPosition: StrandsPosition;
  strands250: Strands250;
  gateKeeper: WhitelistGateKeeper | NFTGateKeeper | CallBackGateKeeper;
  strandsAPI: StrandsAPI;
};

export async function deployTestSystem(override?: {
  useDirectInputBookKeeper: boolean;
  useAccountBookKeeper: boolean;
  useSimpleBookKeeper: boolean;
  useWhitelistGateKeeper: boolean;
  useNFTGateKeeper: boolean;
  useWalletExecutor: boolean;
  wethAsDepositAsset: boolean;
  useCallBackGateKeeper: boolean;
}): Promise<testSystemContracts> {
  const [owner, controller, userAccount, factoryController] =
    await ethers.getSigners(); // skip first two addresses as they are the deployer and alice

  // Deploy ERC20s
  const mockUSDC = (await (
    await ethers.deployContract("TestERC20SetDecimals", ["USDC", "USDC", 6])
  ).waitForDeployment()) as unknown as TestERC20SetDecimals;

  const mockWETH = (await (
    await ethers.deployContract("TestERC20SetDecimals", ["WETH", "WETH", 18])
  ).waitForDeployment()) as unknown as TestERC20SetDecimals;

  const strandsAPI = (await (
    await ethers.deployContract("StrandsAPI", [owner.address,
    controller.address])
  ).waitForDeployment()) as unknown as StrandsAPI;


  // Deploy the RepositoryFactory contract
  const repositoryFactory = (await (
    await ethers.deployContract("RepositoryFactory", [
      owner.address,
      factoryController.address,
      await mockWETH.getAddress()
    ])
  ).waitForDeployment()) as unknown as RepositoryFactory;

  // Deploy a single bookKeeper for the repository
  let newBookKeeper = (await (await ethers.deployContract("BookKeeper")).waitForDeployment()) as unknown as BookKeeper;

  if (override) {
    if (override.useAccountBookKeeper) {
      // console.log("Use AccountNFTBookKeeper")
      newBookKeeper = (await (
        await ethers.deployContract("AccountNFTBookKeeper")
      ).waitForDeployment()) as unknown as AccountNFTBookKeeper;
    } else if (override.useDirectInputBookKeeper) {
      // console.log("Use DirectInputBookKeeper")
      newBookKeeper = (await (
        await ethers.deployContract("DirectInputBookKeeper")
      ).waitForDeployment()) as unknown as DirectInputBookKeeper;
    } else if (override.useSimpleBookKeeper) {
      // console.log("Use SimpleBookKeeper")
      newBookKeeper = (await (
        await ethers.deployContract("SimpleBookKeeper")
      ).waitForDeployment()) as unknown as SimpleBookKeeper;
    } else {
      console.log("Use BookKeeper?")
    }

  }

  // Deploy first250
  const strands250 = (await (await ethers.deployContract("Strands250", [
    "First 250",
    "F250",
    1,
    ""]
  )).waitForDeployment()) as unknown as Strands250;

  // Deploy gatekeeper
  let gateKeeper;
  let gateKeeperAddress = "0x0000000000000000000000000000000000000000";
  if (override) {
    if (override.useWhitelistGateKeeper) {
      gateKeeper = (await (
        await ethers.deployContract("WhitelistGateKeeper")
      ).waitForDeployment()) as unknown as WhitelistGateKeeper;
      // Whitelist the test users to canDeposit and canTransferRepositoryToken
      await gateKeeper.setUserCanDeposit([
        owner,
        (
          await ethers.getSigners()
        )[6].address, // alice
        (
          await ethers.getSigners()
        )[10].address, // bob
        userAccount,
      ]);

      await gateKeeper
        .setDepositWhitelistEnabled(true);
      gateKeeperAddress = await gateKeeper.getAddress()
    } else if (override.useNFTGateKeeper) {
      gateKeeper = (await (
        await ethers.deployContract("NFTGateKeeper", [await strands250.getAddress()])
      ).waitForDeployment()) as unknown as NFTGateKeeper;

      await gateKeeper
        .setDepositWhitelistEnabled(true);
      gateKeeperAddress = await gateKeeper.getAddress()
    } else if (override.useCallBackGateKeeper) {
      gateKeeper = (await (
        await ethers.deployContract("CallBackGateKeeper", [
          await owner.getAddress(),
          await controller.getAddress()
        ])
      ).waitForDeployment()) as unknown as WhitelistGateKeeper;
      gateKeeperAddress = await gateKeeper.getAddress()
      // Whitelist the test users to canDeposit and canTransferRepositoryToken
    }
  }

  // deploy contract or use a wallet
  let executor: any;
  if (override && override.useWalletExecutor) {
    // get a signer to be wallet executor
    executor = (await ethers.getSigners())[4];
  } else {
    // deploy single executor contract to mimic on-chain strategy
    executor = await (await (
      await ethers.deployContract("Executor")
    ).waitForDeployment()) as unknown as Executor;
  }


  let depositAsset
  if (override && override.wethAsDepositAsset) {
    // console.log("use mockWETH as depositAsset")
    depositAsset = mockWETH
  } else if (override && override.useSimpleBookKeeper) {
    // console.log("use strandsAPI as depositAsset")
    depositAsset = strandsAPI
  } else {
    // console.log("use mockUSDC as depositAsset")
    depositAsset = mockUSDC
  }
  // deploy single repository
  await repositoryFactory
    .connect(factoryController)
    .createRepository(
      owner.address,
      controller.address
    );

  // deploy a mock chain link feed(MockAggregatorV2V3)
  const ethMockAggregator = (await (
    (await ethers.getContractFactory(
      "MockAggregatorV2V3"
    )) as unknown as ContractFactory
  )
    .connect(owner)
    .deploy()) as MockAggregatorV2V3; // used to mock ETH price

  // deploy a mock chain link feed(MockAggregatorV2V3)
  const usdcMockAggregator = (await (
    (await ethers.getContractFactory("MockAggregatorV2V3")) as ContractFactory
  )
    .connect(owner)
    .deploy()) as MockAggregatorV2V3; // used to mock ETH price

  // deploying wrapper contracts for bookKeeper feeds
  const ethFeedWrapper = (await (
    (await ethers.getContractFactory("ChainlinkFeedWrapper")) as ContractFactory
  )
    .connect(owner)
    .deploy(await ethMockAggregator.getAddress())) as ChainlinkFeedWrapper; // used to mock ETH price

  const usdcFeedWrapper = (await (
    (await ethers.getContractFactory("ChainlinkFeedWrapper")) as ContractFactory
  )
    .connect(owner)
    .deploy(await usdcMockAggregator.getAddress())) as ChainlinkFeedWrapper; // used to mock ETH price

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
    await depositAsset.getAddress(),
    toBN("100000000", 18),
    toBN("0.01"),
    "StrandsRepositoryToken",
    "STK1"
  );

  await newRepository.connect(controller).setDepositEnabled(true);
  await newRepository.connect(controller).setWithdrawEnabled(true);

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
    userAccount: userAccount as any,
    deployer: owner as any,
    controller: factoryController as any,
    ethFeed: ethMockAggregator,
    USDCFeed: usdcMockAggregator,
    ethFeedWrapper: ethFeedWrapper, // wrappers are means of abstracting the chainlink feed
    usdcFeedWrapper: usdcFeedWrapper, // same for this one
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

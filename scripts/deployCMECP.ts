import hre from "hardhat";
import { ethers, network } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import fs from "fs";
import chalk from "chalk";
import { verifyContractsFromFile } from "./etherscanVerify";
import { toBN } from "./utils/web3utils";
import { exec } from "child_process";
import path from "path";
import {
  RepositoryFactory,
  Repository,
  BookKeeper,
  RepositoryToken,
  TestERC20SetDecimals,
  Executor,
  GateKeeper,
  WhitelistGateKeeper,
  NFTGateKeeper,
  StrandsAccount,
} from "../typechain-types";

import addressConfig from "../config";
import { dumpDeploymentsToFile } from "./utils/zip";
import repositoryFactoryABI from "../artifacts/contracts/RepositoryFactory.sol/RepositoryFactory.json";
import DirectInputBookKeeperABI from "../artifacts/contracts/BookKeepers/DirectInputBookKeeper.sol/DirectInputBookKeeper.json";
import AccountNFTBookKeeperABI from "../artifacts/contracts/BookKeepers/AccountNFTBookKeeper.sol/AccountNFTBookKeeper.json";

import WhitelistGateKeeperABI from "../artifacts/contracts/GateKeepers/WhitelistGateKeeper.sol/WhitelistGateKeeper.json";
import { BOOK_KEEPER_TYPE, GATE_KEEPER_TYPE } from "./type";
import { loadContractAddresses } from "./utils/loadContractAddresses";
import { ContractTransactionReceipt } from "ethers";

type RealRepositoryContracts = {
  repository: Repository;
  bookKeeper: BookKeeper;
  bookKeeperType: BOOK_KEEPER_TYPE;
  repositoryToken: RepositoryToken;
  executor: Executor;
  owner: SignerWithAddress;
  controller: SignerWithAddress;
  folderName: string;
  gateKeeper: WhitelistGateKeeper | NFTGateKeeper;
  gateKeeperType: GATE_KEEPER_TYPE;
};

export type ProdSystemContracts = {
  repositoryFactory: RepositoryFactory;
  repositoryContracts: RealRepositoryContracts[];
  MockUSDC: TestERC20SetDecimals;
  MockWETH: TestERC20SetDecimals;
  deployer: SignerWithAddress;
  chainId: string;
};

async function deployProdSystem(): Promise<ProdSystemContracts> {
  const ownerWallet = process.env.OWNER_WALLET_ADDRESS;
  const controllerWallet = process.env.CONTROLLER_WALLET_ADDRESS;
  const networkName = hre.network.name;
  const [deployerWallet] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId.toString();

  console.log("deployer=%s", await deployerWallet.getAddress())
  console.log("owner=%s", ownerWallet)
  console.log("controller=%s", controllerWallet);

  let USDC, repositoryFactory, bookKeeper, gateKeeper;
  const usdcAddress = addressConfig[networkName].usdcAddress || "";
  let {
    repositoryFactoryAddress,
    bookKeeperAddress,
    gateKeeperAddress,
    repositoryAddress,
    accountNFTAddress,
  } = loadContractAddresses("CmeCoveredPut", chainId);

  // USDC
  if (usdcAddress && usdcAddress != "") {
    console.log(chalk.green(`used existing USDC: ${usdcAddress}`));
    USDC = new ethers.Contract(
      usdcAddress,
      (await ethers.getContractFactory("TestERC20SetDecimals")).interface,
      await ethers.provider.getSigner()
    ) as unknown as TestERC20SetDecimals;
  } else {
    USDC = (await (
      await ethers.deployContract("TestERC20SetDecimals", ["USDC", "USDC", 6])
    ).waitForDeployment()) as unknown as TestERC20SetDecimals;
    console.log(chalk.green(`deployed mock USDC: ${await USDC.getAddress()}`));
  }

  // RepositoryFactory
  if (repositoryFactoryAddress && repositoryFactoryAddress != "") {
    console.log(
      chalk.green(
        `used existing repositoryFactory: ${repositoryFactoryAddress}`
      )
    );
    repositoryFactory = new ethers.Contract(
      repositoryFactoryAddress,
      repositoryFactoryABI.abi,
      await ethers.provider.getSigner()
    ) as unknown as RepositoryFactory;
  } else {
    const repositoryFF = await ethers.getContractFactory("RepositoryFactory");
    repositoryFactory = (await (await repositoryFF.deploy(
      await deployerWallet.getAddress(),
      await deployerWallet.getAddress())).waitForDeployment()) as unknown as RepositoryFactory;
    console.log(
      chalk.green(
        `deployed new repositoryFactory: ${await repositoryFactory.getAddress()}`
      )
    );
  }

  //AccountNFTBookKeeper
  let newBK = false
  if (bookKeeperAddress && bookKeeperAddress != "") {
    console.log(
      chalk.green(`used existing accountNFTBookKeeper: ${bookKeeperAddress}`)
    );
    bookKeeper = new ethers.Contract(
      bookKeeperAddress,
      AccountNFTBookKeeperABI.abi,
      await ethers.provider.getSigner()
    ) as unknown as BookKeeper;
  } else {
    bookKeeper = (await (
      await ethers.deployContract("AccountNFTBookKeeper")
    ).waitForDeployment()) as unknown as BookKeeper;
    console.log(
      chalk.green(
        `deployed new AcountNFTBookKeeper: ${await bookKeeper.getAddress()}`
      )
    );
    newBK = true
  }

  // WhitelistGateKeeper
  if (gateKeeperAddress && gateKeeperAddress != "") {
    console.log(
      chalk.green(`used existing whitelistGateKeeper: ${gateKeeperAddress}`)
    );
    gateKeeper = new ethers.Contract(
      gateKeeperAddress,
      WhitelistGateKeeperABI.abi,
      await ethers.provider.getSigner()
    ) as unknown as WhitelistGateKeeper;
  } else {
    gateKeeper = (await (
      await ethers.deployContract("WhitelistGateKeeper")
    ).waitForDeployment()) as unknown as WhitelistGateKeeper;
    console.log(
      chalk.green(
        `deployed new whitelistGateKeeper ${await gateKeeper.getAddress()}`
      )
    );
  }

  console.log(chalk.green("deploying a single repository"));
  if (repositoryAddress == null || repositoryAddress == "") {
    const repositoryTx = await repositoryFactory
      .connect(deployerWallet)
      .createRepository(
        await deployerWallet.getAddress(),
        await deployerWallet.getAddress(),
        ownerWallet,
        await bookKeeper.getAddress(),
        await gateKeeper.getAddress(),
        await USDC.getAddress(),
        toBN("100000000", 6),
        toBN("0.01"),
        "CME Covered Put",
        "CMECP"
      );
    let receipt: ContractTransactionReceipt = await repositoryTx.wait(1);
    // console.log(receipt);
    repositoryAddress = receipt.logs[receipt.logs.length - 1].args[0];
  }

  // getting the deployed subcontracts.
  const deployedRepositories = await repositoryFactory.deployedRepositories(2);
  console.log("getting values for deployed repository");
  const newRepository = new ethers.Contract(
    repositoryAddress == null || repositoryAddress == ""
      ? deployedRepositories[0]
      : repositoryAddress,
    (await ethers.getContractFactory("Repository")).interface,
    await ethers.provider.getSigner()
  ) as unknown as Repository;
  console.log("Repositorys address: %s", await newRepository.getAddress());

  if (newBK == true) {
    console.log(chalk.green("init bookkeeper with repository address"));
    await (await bookKeeper
      .connect(deployerWallet)
      .init(
        repositoryAddress == null || repositoryAddress == ""
          ? deployedRepositories[0]
          : repositoryAddress
      )).wait();
  }

  console.log(chalk.green("Set bookkeeper acceptable Margin of Error"));
  await bookKeeper.setAcceptableMarginOfError(toBN("0.00001"));

  console.log(chalk.green("Link StrandsAccount NFT with the bookkeeper"));
  // Set the account nft address to the account nft bookkeeper
  if (accountNFTAddress && accountNFTAddress != "") {
    await bookKeeper.setAccountNFT(accountNFTAddress, 4);
  } else {
    console.log("accountNFT missing, set later manually")
  }

  console.log("getting repository token information");
  const repositoryTokenAddress = await newRepository.getRepositoryToken();
  const repositoryToken = new ethers.Contract(
    repositoryTokenAddress,
    (await ethers.getContractFactory("RepositoryToken")).interface,
    await ethers.provider.getSigner()
  ) as unknown as RepositoryToken;

  try {
    console.log("transfer repositoryFactory ownership and controller");
    await (await repositoryFactory.connect(deployerWallet).setIsController(controllerWallet, true)).wait();
  } catch (err) {
    console.log(
      chalk.red(
        "repository factory controller set failed, error details: ",
        err
      )
    );
  }

  try {
    await (await repositoryFactory.connect(deployerWallet).nominateNewOwner(ownerWallet)).wait();
  } catch (err) {
    console.log(
      chalk.red(
        "repository factory nominate new owner failed, error details: ",
        err
      )
    );
  }

  try {
    console.log("transfer repository ownership and controller");
    await (await newRepository.connect(deployerWallet).setIsController(controllerWallet, true)).wait();
  } catch (err) {
    console.log(
      chalk.red("repository controller set failed, error details: ", err)
    );
  }
  try {
    await (await newRepository.connect(deployerWallet).nominateNewOwner(ownerWallet)).wait();;
  } catch (err) {
    console.log(
      chalk.red("repository nominate new owner failed, error details: ", err)
    );
  }

  try {
    await (await gateKeeper.connect(deployerWallet).setDepositWhitelistEnabled(true)).wait();
  } catch (err) {
    console.log(
      chalk.red(
        "gatekeeper depositWhitelistEnabled failed, error details: ",
        err
      )
    );
  }

  try {
    console.log("transfer gatekeeper ownership and controller");
    await (await gateKeeper.connect(deployerWallet).setIsController(controllerWallet, true)).wait();
  } catch (err) {
    console.log(
      chalk.red("gatekeeper controller set failed, error details: ", err)
    );
  }
  try {
    await (await gateKeeper.connect(deployerWallet).nominateNewOwner(ownerWallet)).wait();
  } catch (err) {
    console.log(
      chalk.red("gatekeeper nominate new owner failed, error details: ", err)
    );
  }

  try {
    console.log("transfer bookKeeper ownership and controller");
    await (await bookKeeper.connect(deployerWallet).nominateNewOwner(ownerWallet)).wait();
  } catch (err) {
    console.log(
      chalk.red("bookkeeper nominate new owner failed, error details: ", err)
    );
  }

  return {
    repositoryFactory: repositoryFactory as RepositoryFactory,
    MockUSDC: USDC,
    deployer: deployerWallet as any,
    repositoryContracts: [
      {
        repository: newRepository,
        bookKeeper: bookKeeper,
        bookKeeperType: BOOK_KEEPER_TYPE.ACCOUNT_NFT_BOOK_KEEPER,
        repositoryToken: repositoryToken,
        owner: await deployerWallet.getAddress() as any,
        controller: await deployerWallet.getAddress() as any,
        executor: ownerWallet as any,
        folderName: "CmeCoveredPut",
        gateKeeper,
        gateKeeperType: GATE_KEEPER_TYPE.WHITELIST_GATE_KEEPER,
      },
    ],
    chainId,
  } as ProdSystemContracts;
}

deployProdSystem().then((prodSystem: any) =>
  dumpDeploymentsToFile(prodSystem, "prodSystemCMECP", "deployments")
    .then(() => verifyContractsFromFile("./prodSystemCMECP.json"))
    .catch((error: any) => console.error(error))
);

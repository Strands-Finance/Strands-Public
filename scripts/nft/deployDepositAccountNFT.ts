import "dotenv/config";
import { ethers } from "hardhat";
import { DepositAccount } from "../../typechain-types";
import { etherscanVerification } from "../etherscanVerify";
import zipToDeployments from "../utils/nftZip";
import path from "path";

async function main() {
  let myNFT: DepositAccount;

  const TimWallet = process.env.TIM_WALLET_ADDRESS!;
  const JustinWallet = process.env.JUSTIN_WALLET_ADDRESS!;
  const controllerWallet = process.env.CONTROLLER_WALLET_ADDRESS!;
  const AndyWallet = process.env.ANDY_WALLET_ADDRESS!;

  const tokenURI =
    "https://strands.infura-ipfs.io/ipfs/QmdbqPNXrUKxhfwGzmrAdHeNAPFwcyMqTBYeQitPH7D8YS";
  const name = "Test Deposit Account NFT";
  const symbol = "TSDA";

  const [deployer] = await ethers.getSigners();

  // Get contract factory
  const myNFTFactory = await ethers.getContractFactory("DepositAccount");

  // Deploy the nft
  myNFT = (await (
    await myNFTFactory.connect(deployer).deploy(name, symbol, tokenURI)
  ).waitForDeployment()) as DepositAccount;

  console.log("DepositAccount address=%s", await myNFT.getAddress());

  // Set token uri
  await (await myNFT.connect(deployer).setTokenURI(1, tokenURI)).wait(10);

  // Verify the contract
  await etherscanVerification(await myNFT.getAddress(), [
    name,
    symbol,
    tokenURI,
  ]);

  zipToDeployments(
    "DepositAccount",
    await myNFT.getAddress(),
    `${path.join(
      __dirname,
      "../../artifacts/contracts/nft/DepositAccount.sol/DepositAccount.json"
    )}`,
    `${path.join(
      __dirname,
      "../../typechain-types/contracts/nft/DepositAccount.ts"
    )}`
  );

  // Set wallet as the controller
  await myNFT.connect(deployer).setIsController(AndyWallet, true);
  await myNFT.connect(deployer).setIsController(JustinWallet, true);
  await myNFT.connect(deployer).setIsController(controllerWallet, true);

  // Mint
  await myNFT.connect(deployer).mint(TimWallet, "MetCap", "100101963", 0, 0);
}

main().then((response) => console.log(response));

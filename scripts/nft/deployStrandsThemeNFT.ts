import "dotenv/config";
import { ethers } from "hardhat";
import { StrandsTheme } from "../../typechain-types";
import { etherscanVerification } from "../etherscanVerify";
import zipToDeployments from "../utils/nftZip";
import path from "path";

async function main() {
  let myNFT: StrandsTheme;

  const JustinWallet = process.env.JUSTIN_WALLET_ADDRESS;
  const controllerWallet = process.env.CONTROLLER_WALLET;
  const AndyWallet = process.env.ANDY_WALLET_ADDRESS;

  const tokenURI =
    "https://strands.infura-ipfs.io/ipfs/QmTAApY87va4ktTxbCiasZvvwV8eF7b6g7XwdiMJ6yKu9p";
  const name = "Test Strands Theme NFT";
  const symbol = "TestST";
  const [deployer] = await ethers.getSigners();
  const myNFTFactory = await ethers.getContractFactory("StrandsTheme");

  myNFT = (await (
    await myNFTFactory.connect(deployer).deploy(name, symbol, tokenURI)
  ).waitForDeployment()) as StrandsTheme;

  console.log("StrandsTheme address=%s", await myNFT.getAddress());
  await myNFT.connect(deployer).setTokenURI(1, tokenURI);

  await etherscanVerification(await myNFT.getAddress(), [
    name,
    symbol,
    tokenURI,
  ]);

  zipToDeployments(
    "StrandsTheme",
    await myNFT.getAddress(),
    `${path.join(
      __dirname,
      "../../artifacts/contracts/nft/StrandsTheme.sol/StrandsTheme.json"
    )}`,
    `${path.join(
      __dirname,
      "../../typechain-types/contracts/nft/StrandsTheme.ts"
    )}`
  );

  await myNFT.connect(deployer).setIsController(controllerWallet, true);
  await myNFT.connect(deployer).setIsController(JustinWallet, true);
  await myNFT.connect(deployer).setIsController(AndyWallet, true);
}

main().then((response) => console.log(response));

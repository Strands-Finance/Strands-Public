import "dotenv/config";
import { ethers } from "hardhat";
import { StrandsDev } from "../../typechain-types";
import { etherscanVerification } from "../etherscanVerify";
import zipToDeployments from "../utils/nftZip";
import path from "path";

async function main() {
  let myNFT: StrandsDev;
  const JustinWallet = process.env.JUSTIN_WALLET_ADDRESS;
  const controllerWallet = process.env.CONTROLLER_WALLET_ADDRESS;
  const AndyWallet = process.env.ANDY_WALLET_ADDRESS;

  const tokenURI =
    "https://strands.infura-ipfs.io/ipfs/QmQWBDNkiri3Q94nFwc5cLQ6J6uzZJJ8iHPePoJ9bxE7Kb";
  const name = "Strands Dev 2";
  const symbol = "STDev2";

  const [deployer] = await ethers.getSigners();

  const myNFTFactory = await ethers.getContractFactory("StrandsDev");
  myNFT = (await (
    await myNFTFactory.connect(deployer).deploy(name, symbol, tokenURI)
  ).waitForDeployment()) as StrandsDev;

  console.log("StrandsDev address=%s", await myNFT.getAddress());

  await etherscanVerification(await myNFT.getAddress(), [
    name,
    symbol,
    tokenURI,
  ]);

  zipToDeployments(
    "StrandsDev",
    await myNFT.getAddress(),
    `${path.join(
      __dirname,
      "../../artifacts/contracts/nft/StrandsDev.sol/StrandsDev.json"
    )}`,
    `${path.join(
      __dirname,
      "../../typechain-types/contracts/nft/StrandsDev.ts"
    )}`
  );

  await myNFT.connect(deployer).setIsController(controllerWallet, true);

  await myNFT.connect(deployer).setIsController(AndyWallet, true);

  await myNFT.connect(deployer).setIsController(JustinWallet, true);

  // await myNFT.connect(deployer).mint(HenryWallet);
}

main().then((response) => console.log(response));

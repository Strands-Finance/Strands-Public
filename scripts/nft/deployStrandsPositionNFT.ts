import "dotenv/config";
import { ethers } from "hardhat";
import { StrandsPosition } from "../../typechain-types";
import { etherscanVerification } from "../etherscanVerify";
import zipToDeployments from "../utils/nftZip";
import chalk from "chalk";
import path from "path";

async function main() {
  let myNFT: StrandsPosition;

  const JustinWallet = process.env.JUSTIN_WALLET_ADDRESS;
  const controllerWallet = process.env.CONTROLLER_WALLET;

  const tokenURI =
    "https://strands.infura-ipfs.io/ipfs/QmTAApY87va4ktTxbCiasZvvwV8eF7b6g7XwdiMJ6yKu9p";
  const name = "Strands Position NFT";
  const symbol = "StrandPos";

  const [deployer] = await ethers.getSigners();
  const myNFTFactory = await ethers.getContractFactory("StrandsPosition");
  let myNFTAddress //="0x412E1074ab27c463E7E21C23BF32f142F2c18CE4"
  let accountNFTAddress //="0xcCf343c9307F78B398231d3a0f7C0a4aDA38562C"

  if (myNFTAddress && myNFTAddress != "") {
    console.log(chalk.green(`used existing deployment: ${myNFTAddress}`));
    myNFT = new ethers.Contract(
      myNFTAddress,
      myNFTFactory.interface,
      deployer
    ) as unknown as StrandsPosition;
  } else {
    myNFT = (await (
      await myNFTFactory.connect(deployer).deploy(name, symbol, tokenURI)
    ).waitForDeployment()) as StrandsPosition;
    console.log(chalk.green(`deployed new: ${await myNFT.getAddress()}`));
    await etherscanVerification(await myNFT.getAddress(), [
      name,
      symbol,
      tokenURI,
    ]);
    zipToDeployments(
      "StrandsPosition",
      await myNFT.getAddress(),
      `${path.join(
        __dirname,
        "../../artifacts/contracts/nft/StrandsPosition.sol/StrandsPosition.json"
      )}`,
      `${path.join(
        __dirname,
        "../../typechain-types/contracts/nft/StrandsPosition.ts"
      )}`
    );
  }

  console.log("StrandsPosition address=%s", await myNFT.getAddress());



  if (accountNFTAddress && accountNFTAddress != "") {
    await myNFT
      .connect(deployer)
      .setIsController(accountNFTAddress, true);
  } else {
    console.log("Must add StrandsAccount NFT address as a controller or transferAccount wont work")
  }


  try {
    await myNFT.connect(deployer).nominateNewOwner(ownerWallet);
  } catch (err) {
    console.log(
      chalk.red("repository nominate new owner failed, error details: ", err)
    );
  }

  try {
    await myNFT.connect(deployer).setIsController(deployer, false);
  } catch (err) {
    console.log("failed to set controller wallet - 0");
  }

  try {
    await myNFT.connect(deployer).setIsController(controllerWallet, true);
  } catch (err) {
    console.log("failed to set controller wallet - 1");
  }

  try {
    await myNFT.connect(deployer).setIsController(JustinWallet, true);
  } catch (err) {
    console.log("failed to set controller wallet - 2");
  }
}

main().then((response) => console.log(response));

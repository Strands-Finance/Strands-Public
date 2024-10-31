import "dotenv/config";
import { ethers } from "hardhat";
import { StrandsAccount } from "../../typechain-types";
import { etherscanVerification } from "../etherscanVerify";
import zipToDeployments from "../utils/nftZip";
import chalk from "chalk";
import path from "path";

async function main() {
  let myNFT: StrandsAccount;

  const JustinWallet = process.env.JUSTIN_WALLET_ADDRESS;
  const controllerWallet = process.env.CONTROLLER_WALLET;

  const tokenURI =
    "https://crimson-tough-emu-194.mypinata.cloud/ipfs/QmWjcPCNAdVrzRLerYc8Z6GiN1jaDsZcvp6PU5raZoX1fT";
  const name = "Strands Account NFT";
  const symbol = "StrandsAcct";

  const [deployer] = await ethers.getSigners();
  const myNFTFactory = await ethers.getContractFactory("StrandsAccount");
  let myNFTAddress //="0xcCf343c9307F78B398231d3a0f7C0a4aDA38562C"
  let positionNFTAddress //="0x412E1074ab27c463E7E21C23BF32f142F2c18CE4"

  if (myNFTAddress && myNFTAddress != "") {
    console.log(chalk.green(`used existing deployment: ${myNFTAddress}`));
    myNFT = new ethers.Contract(
      myNFTAddress,
      myNFTFactory.interface,
      deployer
    ) as unknown as StrandsAccount;
  } else {
    myNFT = (await (
      await myNFTFactory.connect(deployer).deploy(name, symbol, tokenURI)
    ).waitForDeployment()) as StrandsAccount;
    console.log(chalk.green(`deployed new: ${await myNFT.getAddress()}`));
    await etherscanVerification(await myNFT.getAddress(), [
      name,
      symbol,
      tokenURI,
    ]);
    zipToDeployments(
      "StrandsAccount",
      await myNFT.getAddress(),
      `${path.join(
        __dirname,
        "../../artifacts/contracts/nft/StrandsAccount.sol/StrandsAccount.json"
      )}`,
      `${path.join(
        __dirname,
        "../../typechain-types/contracts/nft/StrandsAccount.ts"
      )}`
    );
  }

  console.log("StrandsAccount address=%s", await myNFT.getAddress());


  let accounts = ["CDA00670", "CDA00671", "CDA00672", "CDA00673", "CDA00674", "CDA00675"]
  for (let i = 0; i < accounts.length; i++) {
    try {
      console.log("-----mint %s", accounts[i])
      await (
        await myNFT
          .connect(deployer)
          .mint("0xd7fbc3cd08371400b9e4aaa941d13f7b1c48359a", "Wedbush", accounts[i], 0, 0, 0, 0, 0)
      ).wait(10);
    } catch (err) {
      console.log("failed to set mint account %s:%s", i, err);
    }
  }

  try {
    await myNFT.connect(deployer).nominateNewOwner(ownerWallet);
  } catch (err) {
    console.log(
      chalk.red("repository nominate new owner failed, error details: ", err)
    );
  }

  if (positionNFTAddress && positionNFTAddress != "") {
    await (
      await myNFT
        .connect(deployer)
        .setPositionNFT(positionNFTAddress)
    ).wait(10);
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

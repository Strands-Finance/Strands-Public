import "dotenv/config";
import { ethers } from "hardhat";
import { S1Position } from "../../typechain-types";
import { etherscanVerification } from "../etherscanVerify";
import zipToDeployments from "../utils/nftZip";
import path from "path";

async function main() {
  let myNFT: S1Position;
  const TimWallet = process.env.TIM_WALLET_ADDRESS!;
  const JustinWallet = process.env.JUSTIN_WALLET_ADDRESS!;
  const controllerWallet = process.env.CONTROLLER_WALLET_ADDRESS!;
  const AndyWallet = process.env.ANDY_WALLET_ADDRESS!;
  const TimDemoWallet = process.env.TIM_DEMO_WALLET_ADDRESS!;

  const tokenURI =
    "https://strands.infura-ipfs.io/ipfs/QmZwGX7gH2WR6SHKcZ3LY1Kz6ga6D5BnPJ9eEhL98cPrjt";

  const name = "Test S1 Position NFT";
  const symbol = "TS1P";

  const [deployer] = await ethers.getSigners();

  const myNFTFactory = await ethers.getContractFactory("S1Position");

  myNFT = (await (
    await myNFTFactory.connect(deployer).deploy(name, symbol, tokenURI)
  ).waitForDeployment()) as S1Position;

  console.log("S1Position address=%s", await myNFT.getAddress());

  await etherscanVerification(await myNFT.getAddress(), [
    name,
    symbol,
    tokenURI,
  ]);

  zipToDeployments(
    "S1Position",
    await myNFT.getAddress(),
    `${path.join(
      __dirname,
      "../../artifacts/contracts/nft/S1Position.sol/S1Position.json"
    )}`,
    `${path.join(
      __dirname,
      "../../typechain-types/contracts/nft/S1Position.ts"
    )}`
  );

  await myNFT.connect(deployer).setIsController(AndyWallet, true);
  await myNFT.connect(deployer).setIsController(JustinWallet, true);
  await myNFT.connect(deployer).setIsController(controllerWallet, true);

  // await myNFT
  //   .connect(deployer)
  //   .mint(JustinWallet, ethers.parseUnits("491.0876745054822"));
  // await myNFT
  //   .connect(deployer)
  //   .mint(JustinWallet, ethers.parseUnits("151.699739837813"));
  // await myNFT
  //   .connect(deployer)
  //   .mint(JustinWallet, ethers.parseUnits("189.446168239202"));
  // await myNFT
  //   .connect(deployer)
  //   .mint(JustinWallet, ethers.parseUnits("46.3834868617971"));
  // await myNFT
  //   .connect(deployer)
  //   .mint(TimWallet, ethers.utils.parseUnits("366.56899233893"));
}

main().then((response) => console.log(response));

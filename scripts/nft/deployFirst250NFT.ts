import hre from "hardhat";
import "dotenv/config";
import { ethers } from "hardhat";
import { Strands250 } from "../../typechain-types";
import addressConfig from "../../config";
import { etherscanVerification } from "../etherscanVerify";
import zipToDeployments from "../utils/nftZip";
import path from "path";

async function main() {
  const networkName = hre.network.name;
  let StrandsFirst250: Strands250;

  const baseURI =
    "https://strands.infura-ipfs.io/ipfs/Qma5u9EEMsN67ehCsLNtLVrv4YDxCNYowwUKFTJzTt3JCN/meta250/";
  const tokenURI = "token1.json";
  const cap = 250;
  const name = "Strands First 250 NFT";
  const symbol = "First250";
  const JustinWallet = process.env.JUSTIN_WALLET_ADDRESS || "";
  const AndyWallet = process.env.ANDY_WALLET_ADDRESS || "";
  const controllerWallet = process.env.CONTROLLER_WALLET_ADDRESS || "";

  const [deployer] = await ethers.getSigners();

  const StrandsFirst250Factory = await ethers.getContractFactory("Strands250");

  StrandsFirst250 = (await (
    await StrandsFirst250Factory.connect(deployer).deploy(
      name,
      symbol,
      cap,
      baseURI
    )
  ).waitForDeployment()) as Strands250;

  console.log("StrandsFirst250 address=%s", await StrandsFirst250.getAddress());

  await etherscanVerification(await StrandsFirst250.getAddress(), [
    name,
    symbol,
    cap.toString(),
    baseURI,
  ]);

  zipToDeployments(
    "Strands250",
    await StrandsFirst250.getAddress(),
    `${path.join(
      __dirname,
      "../../artifacts/contracts/nft/Strands250.sol/Strands250.json"
    )}`,
    `${path.join(
      __dirname,
      "../../typechain-types/contracts/nft/Strands250.ts"
    )}`
  );

  await StrandsFirst250.connect(deployer).setTokenURI(1, tokenURI);
  console.log("tokenURI set");

  await StrandsFirst250.connect(deployer).setIsController(AndyWallet, true);

  await StrandsFirst250.connect(deployer).setIsController(JustinWallet, true);

  await StrandsFirst250.connect(deployer).setIsController(controllerWallet, true);

  await StrandsFirst250.connect(deployer).adminSelfBatchMint(250);
  console.log("adminSelfBatchMint");

  await StrandsFirst250.connect(deployer).setFeeAmount(10 ** 7);
  console.log("fee set");

  await StrandsFirst250.connect(deployer).setFeeRecipient(deployer.address);
  console.log("feeRecipient set");

  await StrandsFirst250.connect(deployer).setFeeToken(
    addressConfig[networkName].usdcAddress || ""
  );
  console.log("fee token set=%s", addressConfig[networkName].usdcAddress);
}

main().then((response) => console.log(response));

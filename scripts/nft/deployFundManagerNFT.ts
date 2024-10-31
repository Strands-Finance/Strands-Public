import "dotenv/config";
import { ethers } from "hardhat";
// Types
import { FundManager } from "../../typechain-types";
import { etherscanVerification } from "../etherscanVerify";
import zipToDeployments from "../utils/nftZip";
import path from "path";

async function main() {
  let myNFT: FundManager;

  const TimWallet = process.env.TIM_WALLET_ADDRESS!;
  const JustinWallet = process.env.JUSTIN_WALLET_ADDRESS!;
  const AndyWallet = process.env.ANDY_WALLET_ADDRESS!;
  const controllerWallet = process.env.CONTROLLER_WALLET_ADDRESS!;

  //-----Metcap TMRW Sports-----
  const tokenURI =
    "https://strands.infura-ipfs.io/ipfs/QmUHhENSHyRQzuwj59Ls8JtFw4akcRx1xqBkjBpLkgmyUH";
  const name = "MetCap TMRW Sports NFT";
  const symbol = "SFM1";

  // -----Metcap-----
  // const tokenURI = 'https://strands.infura-ipfs.io/ipfs/QmUHhENSHyRQzuwj59Ls8JtFw4akcRx1xqBkjBpLkgmyUH'
  // const name = 'MetCap NFT'
  // const symbol = 'MNFT'

  //-----Ananke-----
  // const tokenURI = 'https://strands.infura-ipfs.io/ipfs/QmRnxgBgUnkYfHcF4JtMHngwm3yHvSV9HXBsdSxqkKE985'
  // const name = 'Ananke NFT'
  // const symbol = 'ANFT'

  const [deployer] = await ethers.getSigners();

  const cap = 5;

  console.log("deployer=", deployer.address);

  const myNFTFactory = await ethers.getContractFactory("FundManager");

  myNFT = (await (
    await myNFTFactory.connect(deployer).deploy(name, symbol, cap, tokenURI)
  ).waitForDeployment()) as FundManager;

  console.log("FundManager address=%s", await myNFT.getAddress());
  await myNFT.connect(deployer).setTokenURI(1, tokenURI);

  await etherscanVerification(await myNFT.getAddress(), [
    name,
    symbol,
    cap.toString(),
    tokenURI,
  ]);

  zipToDeployments(
    "FundManager",
    await myNFT.getAddress(),
    `${path.join(
      __dirname,
      "../../artifacts/contracts/nft/FundManager.sol/FundManager.json"
    )}`,
    `${path.join(
      __dirname,
      "../../typechain-types/contracts/nft/FundManager.ts"
    )}`
  );

  await myNFT.connect(deployer).setIsController(AndyWallet, true);
  await myNFT.connect(deployer).setIsController(JustinWallet, true);
  await myNFT.connect(deployer).setIsController(controllerWallet, true);

  // await (await myNFT.connect(deployer).adminSelfBatchMint(1)).wait(10)
  // await (await myNFT.connect(deployer).setNAV(ethers.utils.parseUnits("1"))).wait(10)
  // await (await myNFT.connect(deployer).setNumOfShares(ethers.utils.parseUnits("2055000"))).wait(10)
  // await (await myNFT.connect(deployer).mint(JustinWallet)).wait(10)
  // await (await myNFT.connect(deployer).mint(TimWallet)).wait(10)
}

main().then((response) => console.log(response));

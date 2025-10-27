import "dotenv/config";
import hre from "hardhat";
import { FundManager } from "../../typechain-types";
import { verifyContractsFromFile } from "../utils/etherscanVerify";
import { executeWithRetry } from "../utils/deploymentUtils";
import zipToDeployments from "../utils/nftZip";
import chalk from "chalk";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// In Hardhat v3 with ESM, ethers is available through network.connect()
const { ethers } = await hre.network.connect();

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration - Choose the fund by uncommenting the desired config
const CONFIG = {
  // Currently active: MetCap TMRW Sports
  tokenURI: "https://strands.infura-ipfs.io/ipfs/QmUHhENSHyRQzuwj59Ls8JtFw4akcRx1xqBkjBpLkgmyUH",
  name: "MetCap TMRW Sports NFT",
  symbol: "SFM1",

  // MetCap config (uncomment to use):
  // tokenURI: "https://strands.infura-ipfs.io/ipfs/QmUHhENSHyRQzuwj59Ls8JtFw4akcRx1xqBkjBpLkgmyUH",
  // name: "MetCap NFT",
  // symbol: "MNFT",

  cap: 5,
  confirmations: 2,
  controllers: {
    justin: "0x01D28924E57fe5d244BBDc9eB7cf51217728D9DF",
    controller: "0xf76236D237847B9030bc251f70b9b26508fa0ed7",
  },
};

// Helper function for retrying transactions
async function main() {
  console.log(chalk.blue("=== Fund Manager NFT Deployment ===\n"));

  const [deployer] = await ethers.getSigners();
  console.log(chalk.cyan(`Deployer address: ${deployer.address}`));
  console.log(chalk.cyan(`Network: ${(await ethers.provider.getNetwork()).name}`));
  console.log(chalk.cyan(`Chain ID: ${(await ethers.provider.getNetwork()).chainId}\n`));

  // Step 1: Deploy contract
  console.log(chalk.yellow("Deploying FundManager contract..."));
  const myNFTFactory = await ethers.getContractFactory("FundManager");
  const deployment = await myNFTFactory
    .connect(deployer)
    .deploy(CONFIG.name, CONFIG.symbol, CONFIG.cap, CONFIG.tokenURI);

  console.log(chalk.yellow(`Waiting for deployment confirmation...`));
  const myNFT = (await deployment.waitForDeployment()) as FundManager;
  const address = await myNFT.getAddress();

  console.log(chalk.green(`✓ Deployed FundManager at: ${address}`));

  // Step 2: Save deployment file (same pattern as deploymentRunner)
  const deploymentFile = "deploymentFundManager";
  const deploymentData = {
    FundManager: {
      address: address,
      arguments: [CONFIG.name, CONFIG.symbol, CONFIG.cap, CONFIG.tokenURI],
      contract: "contracts/nft/FundManager.sol:FundManager"
    }
  };
  fs.writeFileSync(
    `./${deploymentFile}.json`,
    JSON.stringify(deploymentData, null, 2)
  );

  // Save to deployments folder structure
  zipToDeployments(
    "FundManager",
    address,
    `${path.join(
      __dirname,
      "../../artifacts/contracts/nft/FundManager.sol/FundManager.json"
    )}`,
    `${path.join(
      __dirname,
      "../../typechain-types/nft/FundManager.ts"
    )}`
  );

  // Step 3: Verify on Etherscan (same pattern as deploymentRunner)
  console.log(chalk.yellow("\n=== Etherscan Verification ==="));
  const networkName = (await ethers.provider.getNetwork()).name;
  await verifyContractsFromFile(`./${deploymentFile}.json`, networkName);

  // Step 4: Set token URI
  console.log(chalk.blue("\n=== Initial Configuration ==="));
  await executeWithRetry(
    async () => {
      const tx = await myNFT.connect(deployer).setTokenURI(1, CONFIG.tokenURI);
      await tx.wait(CONFIG.confirmations);
    },
    "Set token URI"
  );

  // Step 5: Set controllers
  console.log(chalk.blue("\n=== Setting Controllers ==="));

  for (const [name, wallet] of Object.entries(CONFIG.controllers)) {
    await executeWithRetry(
      async () => {
        const tx = await myNFT.connect(deployer).setIsController(wallet, true);
        await tx.wait(CONFIG.confirmations);
      },
      `Set ${name} wallet (${wallet}) as controller`
    );
  }

  // Optional steps (uncomment as needed):
  // await executeWithRetry(
  //   async () => {
  //     const tx = await myNFT.connect(deployer).adminSelfBatchMint(1);
  //     await tx.wait(CONFIG.confirmations);
  //   },
  //   "Batch mint to deployer"
  // );

  // await executeWithRetry(
  //   async () => {
  //     const tx = await myNFT.connect(deployer).setNAV(ethers.parseUnits("1"));
  //     await tx.wait(CONFIG.confirmations);
  //   },
  //   "Set NAV"
  // );

  // await executeWithRetry(
  //   async () => {
  //     const tx = await myNFT.connect(deployer).setNumOfShares(ethers.parseUnits("2055000"));
  //     await tx.wait(CONFIG.confirmations);
  //   },
  //   "Set number of shares"
  // );

  // Step 6: Final verification
  console.log(chalk.blue("\n=== Deployment Summary ==="));
  console.log(chalk.green(`Contract: ${address}`));
  console.log(chalk.green(`Owner: ${await myNFT.owner()}`));
  console.log(chalk.green(`Cap: ${CONFIG.cap}`));

  for (const [name, wallet] of Object.entries(CONFIG.controllers)) {
    const isController = await myNFT.isController(wallet);
    console.log(chalk.green(`${name} is controller: ${isController}`));
  }

  console.log(chalk.blue("\n=== Deployment Complete ===\n"));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red("\n✗ Deployment failed:"), error);
    process.exit(1);
  });

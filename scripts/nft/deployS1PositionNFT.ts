import "dotenv/config";
import hre from "hardhat";
import { S1Position } from "../../typechain-types";
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

// Configuration
const CONFIG = {
  tokenURI: "https://strands.infura-ipfs.io/ipfs/QmZwGX7gH2WR6SHKcZ3LY1Kz6ga6D5BnPJ9eEhL98cPrjt",
  name: "Test S1 Position NFT",
  symbol: "TS1P",
  confirmations: 2,
  controllers: {
    tim: "0xD7fBc3cD08371400b9e4aaA941D13f7b1c48359A",
    justin: "0x01D28924E57fe5d244BBDc9eB7cf51217728D9DF",
    controller: "0xf76236D237847B9030bc251f70b9b26508fa0ed7"
  },
};

// Helper function for retrying transactions
async function main() {
  console.log(chalk.blue("=== S1 Position NFT Deployment ===\n"));

  const [deployer] = await ethers.getSigners();
  console.log(chalk.cyan(`Deployer address: ${deployer.address}`));
  console.log(chalk.cyan(`Network: ${(await ethers.provider.getNetwork()).name}`));
  console.log(chalk.cyan(`Chain ID: ${(await ethers.provider.getNetwork()).chainId}\n`));

  // Step 1: Deploy contract
  console.log(chalk.yellow("Deploying S1Position contract..."));
  const myNFTFactory = await ethers.getContractFactory("S1Position");
  const deployment = await myNFTFactory
    .connect(deployer)
    .deploy(CONFIG.name, CONFIG.symbol, CONFIG.tokenURI);

  console.log(chalk.yellow(`Waiting for deployment confirmation...`));
  const myNFT = (await deployment.waitForDeployment()) as S1Position;
  const address = await myNFT.getAddress();

  console.log(chalk.green(`✓ Deployed S1Position at: ${address}`));

  // Step 2: Save deployment file (same pattern as deploymentRunner)
  const deploymentFile = "deploymentS1Position";
  const deploymentData = {
    S1Position: {
      address: address,
      arguments: [CONFIG.name, CONFIG.symbol, CONFIG.tokenURI],
      contract: "contracts/nft/S1Position.sol:S1Position"
    }
  };
  fs.writeFileSync(
    `./${deploymentFile}.json`,
    JSON.stringify(deploymentData, null, 2)
  );

  // Save to deployments folder structure
  zipToDeployments(
    "S1Position",
    address,
    `${path.join(
      __dirname,
      "../../artifacts/contracts/nft/S1Position.sol/S1Position.json"
    )}`,
    `${path.join(
      __dirname,
      "../../typechain-types/nft/S1Position.ts"
    )}`
  );

  // Step 3: Verify on Etherscan (same pattern as deploymentRunner)
  console.log(chalk.yellow("\n=== Etherscan Verification ==="));
  const networkName = (await ethers.provider.getNetwork()).name;
  await verifyContractsFromFile(`./${deploymentFile}.json`, networkName);

  // Step 4: Set controllers
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

  // Step 5: Final verification
  console.log(chalk.blue("\n=== Deployment Summary ==="));
  console.log(chalk.green(`Contract: ${address}`));
  console.log(chalk.green(`Owner: ${await myNFT.owner()}`));

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

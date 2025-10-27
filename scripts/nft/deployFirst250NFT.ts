import "dotenv/config";
import hre from "hardhat";
import { Strands250 } from "../../typechain-types";
import addressConfig from "../../config";
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
  baseURI: "https://strands.infura-ipfs.io/ipfs/Qma5u9EEMsN67ehCsLNtLVrv4YDxCNYowwUKFTJzTt3JCN/meta250/",
  tokenURI: "token1.json",
  cap: 250,
  name: "Strands First 250 NFT",
  symbol: "First250",
  feeAmount: 10 ** 7,
  confirmations: 2,
  controllers: {
    justin: "0x01D28924E57fe5d244BBDc9eB7cf51217728D9DF",
    controller: "0xf76236D237847B9030bc251f70b9b26508fa0ed7",
  },
};

// Helper function for retrying transactions
async function main() {
  console.log(chalk.blue("=== Strands First 250 NFT Deployment ===\n"));

  const networkName = hre.network.name;
  const [deployer] = await ethers.getSigners();

  console.log(chalk.cyan(`Deployer address: ${deployer.address}`));
  console.log(chalk.cyan(`Network: ${networkName}`));
  console.log(chalk.cyan(`Chain ID: ${(await ethers.provider.getNetwork()).chainId}\n`));

  // Step 1: Deploy contract
  console.log(chalk.yellow("Deploying Strands250 contract..."));
  const StrandsFirst250Factory = await ethers.getContractFactory("Strands250");
  const deployment = await StrandsFirst250Factory.connect(deployer).deploy(
    CONFIG.name,
    CONFIG.symbol,
    CONFIG.cap,
    CONFIG.baseURI
  );

  console.log(chalk.yellow(`Waiting for deployment confirmation...`));
  const StrandsFirst250 = (await deployment.waitForDeployment()) as Strands250;
  const address = await StrandsFirst250.getAddress();

  console.log(chalk.green(`✓ Deployed Strands250 at: ${address}`));

  // Step 2: Save deployment file (same pattern as deploymentRunner)
  const deploymentFile = "deploymentStrands250";
  const deploymentData = {
    Strands250: {
      address: address,
      arguments: [CONFIG.name, CONFIG.symbol, CONFIG.cap, CONFIG.baseURI],
      contract: "contracts/nft/Strands250.sol:Strands250"
    }
  };
  fs.writeFileSync(
    `./${deploymentFile}.json`,
    JSON.stringify(deploymentData, null, 2)
  );

  // Save to deployments folder structure
  zipToDeployments(
    "Strands250",
    address,
    `${path.join(
      __dirname,
      "../../artifacts/contracts/nft/Strands250.sol/Strands250.json"
    )}`,
    `${path.join(
      __dirname,
      "../../typechain-types/nft/Strands250.ts"
    )}`
  );

  // Step 3: Verify on Etherscan (same pattern as deploymentRunner)
  console.log(chalk.yellow("\n=== Etherscan Verification ==="));
  await verifyContractsFromFile(`./${deploymentFile}.json`, networkName);

  // Step 4: Initial configuration
  console.log(chalk.blue("\n=== Initial Configuration ==="));

  await executeWithRetry(
    async () => {
      const tx = await StrandsFirst250.connect(deployer).setTokenURI(1, CONFIG.tokenURI);
      await tx.wait(CONFIG.confirmations);
    },
    "Set token URI"
  );

  // Step 5: Set controllers
  console.log(chalk.blue("\n=== Setting Controllers ==="));

  for (const [name, wallet] of Object.entries(CONFIG.controllers)) {
    await executeWithRetry(
      async () => {
        const tx = await StrandsFirst250.connect(deployer).setIsController(wallet, true);
        await tx.wait(CONFIG.confirmations);
      },
      `Set ${name} wallet (${wallet}) as controller`
    );
  }

  // Step 6: Batch mint
  console.log(chalk.blue("\n=== Batch Minting ==="));
  await executeWithRetry(
    async () => {
      const tx = await StrandsFirst250.connect(deployer).adminSelfBatchMint(250);
      await tx.wait(CONFIG.confirmations);
    },
    "Batch mint 250 NFTs to deployer"
  );

  // Step 7: Set fees
  console.log(chalk.blue("\n=== Setting Fees ==="));

  await executeWithRetry(
    async () => {
      const tx = await StrandsFirst250.connect(deployer).setFeeAmount(CONFIG.feeAmount);
      await tx.wait(CONFIG.confirmations);
    },
    `Set fee amount to ${CONFIG.feeAmount}`
  );

  await executeWithRetry(
    async () => {
      const tx = await StrandsFirst250.connect(deployer).setFeeRecipient(deployer.address);
      await tx.wait(CONFIG.confirmations);
    },
    `Set fee recipient to ${deployer.address}`
  );

  const usdcAddress = addressConfig[networkName]?.usdcAddress;
  if (usdcAddress) {
    await executeWithRetry(
      async () => {
        const tx = await StrandsFirst250.connect(deployer).setFeeToken(usdcAddress);
        await tx.wait(CONFIG.confirmations);
      },
      `Set fee token to USDC (${usdcAddress})`
    );
  } else {
    console.log(chalk.yellow(`⚠ No USDC address configured for network ${networkName}`));
  }

  // Step 8: Final verification
  console.log(chalk.blue("\n=== Deployment Summary ==="));
  console.log(chalk.green(`Contract: ${address}`));
  console.log(chalk.green(`Owner: ${await StrandsFirst250.owner()}`));
  console.log(chalk.green(`Cap: ${CONFIG.cap}`));
  console.log(chalk.green(`Total Supply: ${await StrandsFirst250.totalSupply()}`));

  for (const [name, wallet] of Object.entries(CONFIG.controllers)) {
    const isController = await StrandsFirst250.isController(wallet);
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

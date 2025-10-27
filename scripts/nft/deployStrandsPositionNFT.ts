import "dotenv/config";
import hre from "hardhat";
import { StrandsPosition } from "../../typechain-types";
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
  tokenURI: "https://strands.infura-ipfs.io/ipfs/QmTAApY87va4ktTxbCiasZvvwV8eF7b6g7XwdiMJ6yKu9p",
  name: "Strands Position NFT",
  symbol: "StrandPos",
  confirmations: 2,
  existingAddress: "0xf7Cbcb5386faDb2A65EaF4931281c33f11b88713",
  accountNFTAddress: "0x9bD26589D1C73608B6E90a060C840009Fc502d82",
};

async function main() {
  console.log(chalk.blue("=== Strands Position NFT Deployment ===\n"));

  let myNFT: StrandsPosition;

  // Load environment variables
  const JustinWallet = process.env.JUSTIN_WALLET_ADDRESS;
  const keeperWallet = process.env.CONTROLLER_WALLET;

  if (!keeperWallet) {
    throw new Error("CONTROLLER_WALLET not set in environment");
  }

  const [deployer] = await ethers.getSigners();
  console.log(chalk.cyan(`Deployer address: ${deployer.address}`));
  console.log(chalk.cyan(`Network: ${(await ethers.provider.getNetwork()).name}`));
  console.log(chalk.cyan(`Chain ID: ${(await ethers.provider.getNetwork()).chainId}\n`));

  const myNFTFactory = await ethers.getContractFactory("StrandsPosition");
  let nftAddress = CONFIG.existingAddress;

  // Step 1: Deploy or use existing contract
  if (nftAddress && nftAddress != "") {
    console.log(chalk.green(`✓ Using existing deployment: ${nftAddress}`));
    myNFT = new ethers.Contract(
      nftAddress,
      myNFTFactory.interface,
      deployer
    ) as unknown as StrandsPosition;
  } else {
    console.log(chalk.yellow("Deploying new StrandsPosition contract..."));
    const deployment = await myNFTFactory
      .connect(deployer)
      .deploy(CONFIG.name, CONFIG.symbol, CONFIG.tokenURI);

    console.log(chalk.yellow(`Waiting for deployment confirmation...`));
    myNFT = (await deployment.waitForDeployment()) as StrandsPosition;
    nftAddress = await myNFT.getAddress();

    console.log(chalk.green(`✓ Deployed StrandsPosition at: ${nftAddress}`));
  }

  // Save to deployments (same pattern as deploymentRunner)
  const deploymentFile = "deploymentStrandsPosition";
  const deploymentData = {
    StrandsPosition: {
      address: nftAddress,
      arguments: [CONFIG.name, CONFIG.symbol, CONFIG.tokenURI],
      contract: "contracts/nft/StrandsPosition.sol:StrandsPosition"
    }
  };
  fs.writeFileSync(
    `./${deploymentFile}.json`,
    JSON.stringify(deploymentData, null, 2)
  );

  // Also save to deployments folder structure
  zipToDeployments(
    "StrandsPosition",
    nftAddress,
    `${path.join(
      __dirname,
      "../../artifacts/contracts/nft/StrandsPosition.sol/StrandsPosition.json"
    )}`,
    `${path.join(
      __dirname,
      "../../typechain-types/nft/StrandsPosition.ts"
    )}`
  );

  // Verify on Etherscan (same pattern as deploymentRunner)
  console.log(chalk.yellow("\n=== Etherscan Verification ==="));
  const networkName = (await ethers.provider.getNetwork()).name;
  await verifyContractsFromFile(`./${deploymentFile}.json`, networkName);

  console.log(chalk.blue(`\n=== Contract Address ===`));
  console.log(chalk.cyan(`StrandsPosition: ${nftAddress}\n`));

  // Step 2: Set StrandsAccount as controller
  console.log(chalk.blue("=== Setting Controllers ==="));
  if (CONFIG.accountNFTAddress && CONFIG.accountNFTAddress != "") {
    await executeWithRetry(
      async () => {
        const tx = await myNFT.connect(deployer).setIsController(CONFIG.accountNFTAddress, true);
        await tx.wait(CONFIG.confirmations);
      },
      `Set StrandsAccount (${CONFIG.accountNFTAddress}) as controller`,
      myNFT.interface
    );
  } else {
    console.log(
      chalk.yellow(
        "⚠ No StrandsAccount NFT address provided - transferAccount won't work until this is set"
      )
    );
  }

  // Set keeper wallet as controller
  await executeWithRetry(
    async () => {
      const tx = await myNFT.connect(deployer).setIsController(keeperWallet, true);
      await tx.wait(CONFIG.confirmations);
    },
    `Set keeper wallet (${keeperWallet}) as controller`,
    myNFT.interface
  );

  // Set Justin wallet as controller (if provided)
  if (JustinWallet) {
    await executeWithRetry(
      async () => {
        const tx = await myNFT.connect(deployer).setIsController(JustinWallet, true);
        await tx.wait(CONFIG.confirmations);
      },
      `Set Justin wallet (${JustinWallet}) as controller`,
      myNFT.interface
    );
  }

  const minterWallets = ['0x6F3e119D934b86BcCf93421BBE75dDb9550070E9',
      '0x7F04a78456C84cc736B09465B2bA9F23cF8aD76E',
      '0x80F3E7E80a9cFa9fe5C5A5568f2Cde3D0d7b0BA6',
      '0xB28EB9Fb315F8156e3aAaA6aC8A24b9C76d76cdb',
      '0x3136127e53CcAc3cd9D6eA9162cDE8a17e5A5649',
      '0x04ca0dFB77C5E3FaE409c427B7A22db4699B61f3']
  for (let i = 0; i < minterWallets.length; i++) {
    let minter=minterWallets[i]
    await executeWithRetry(
      async () => {
        const tx = await myNFT.connect(deployer).setIsController(minter, true);
        await tx.wait(CONFIG.confirmations);
      },
      `Set minter${i} wallet (${minter}) as controller`,
      myNFT.interface
    );
  }

  // Step 3: Transfer ownership
  console.log(chalk.blue("\n=== Transferring Ownership ==="));
  await executeWithRetry(
    async () => {
      const tx = await myNFT.connect(deployer).nominateNewOwner(keeperWallet);
      await tx.wait(CONFIG.confirmations);
    },
    `Nominate ${keeperWallet} as new owner`,
    myNFT.interface
  );

  // Remove deployer as controller
  await executeWithRetry(
    async () => {
      const tx = await myNFT.connect(deployer).setIsController(deployer.address, false);
      await tx.wait(CONFIG.confirmations);
    },
    "Remove deployer as controller",
    myNFT.interface
  );

  // Step 4: Final verification
  console.log(chalk.blue("\n=== Deployment Summary ==="));
  console.log(chalk.green(`Contract: ${nftAddress}`));
  console.log(chalk.green(`Owner: ${await myNFT.owner()}`));
  console.log(chalk.green(`Nominated Owner: ${await myNFT.nominatedOwner()}`));
  console.log(
    chalk.green(`Keeper is controller: ${await myNFT.isController(keeperWallet)}`)
  );
  if (JustinWallet) {
    console.log(
      chalk.green(`Justin is controller: ${await myNFT.isController(JustinWallet)}`)
    );
  }
  console.log(
    chalk.green(`Deployer is controller: ${await myNFT.isController(deployer.address)}`)
  );

  console.log(chalk.blue("\n=== Deployment Complete ===\n"));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red("\n✗ Deployment failed:"), error);
    process.exit(1);
  });

import "dotenv/config";
import hre from "hardhat";
import { StrandsAccount } from "../../typechain-types";
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
  tokenURI:
    "https://crimson-tough-emu-194.mypinata.cloud/ipfs/QmWjcPCNAdVrzRLerYc8Z6GiN1jaDsZcvp6PU5raZoX1fT",
  name: "Strands Account NFT",
  symbol: "StrandsAcct",
  confirmations: 2,
  existingAddress: "0x9bD26589D1C73608B6E90a060C840009Fc502d82",
  positionNFTAddress: "0xf7Cbcb5386faDb2A65EaF4931281c33f11b88713",
};

async function main() {
  console.log(chalk.blue("=== Strands Account NFT Deployment ===\n"));

  let myNFT: StrandsAccount;

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

  const myNFTFactory = await ethers.getContractFactory("StrandsAccount");
  let nftAddress = CONFIG.existingAddress;

  // Step 1: Deploy or use existing contract
  if (nftAddress && nftAddress != "") {
    console.log(chalk.green(`✓ Using existing deployment: ${nftAddress}`));
    myNFT = new ethers.Contract(
      nftAddress,
      myNFTFactory.interface,
      deployer
    ) as unknown as StrandsAccount;
  } else {
    console.log(chalk.yellow("Deploying new StrandsAccount contract..."));
    const deployment = await myNFTFactory
      .connect(deployer)
      .deploy(CONFIG.name, CONFIG.symbol, CONFIG.tokenURI);

    console.log(chalk.yellow(`Waiting for deployment confirmation...`));
    myNFT = (await deployment.waitForDeployment()) as StrandsAccount;
    nftAddress = await myNFT.getAddress();

    console.log(chalk.green(`✓ Deployed StrandsAccount at: ${nftAddress}`));
  }

  // Save deployment file (same pattern as deploymentRunner)
  const deploymentFile = "deploymentStrandsAccount";
  const deploymentData = {
    StrandsAccount: {
      address: nftAddress,
      arguments: [CONFIG.name, CONFIG.symbol, CONFIG.tokenURI],
      contract: "contracts/nft/StrandsAccount.sol:StrandsAccount"
    }
  };
  fs.writeFileSync(
    `./${deploymentFile}.json`,
    JSON.stringify(deploymentData, null, 2)
  );

  // Save to deployments folder structure
  zipToDeployments(
    "StrandsAccount",
    nftAddress,
    `${path.join(
      __dirname,
      "../../artifacts/contracts/nft/StrandsAccount.sol/StrandsAccount.json"
    )}`,
    `${path.join(
      __dirname,
      "../../typechain-types/nft/StrandsAccount.ts"
    )}`
  );

  // Verify on Etherscan (same pattern as deploymentRunner)
  console.log(chalk.yellow("\n=== Etherscan Verification ==="));
  const networkName = (await ethers.provider.getNetwork()).name;
  await verifyContractsFromFile(`./${deploymentFile}.json`, networkName);

  console.log(chalk.blue(`\n=== Contract Address ===`));
  console.log(chalk.cyan(`StrandsAccount: ${nftAddress}\n`));

  // ---Prod---
  let accounts = {"DNA00001":"0xD7fBc3cD08371400b9e4aaA941D13f7b1c48359A",
                "DNA00002":"0xD7fBc3cD08371400b9e4aaA941D13f7b1c48359A",
                "DNA00003":"0xD7fBc3cD08371400b9e4aaA941D13f7b1c48359A",
                "DNA00004":"0xD7fBc3cD08371400b9e4aaA941D13f7b1c48359A",
                "DNA00005":"0xD7fBc3cD08371400b9e4aaA941D13f7b1c48359A",
                "DNA00006":"0xD7fBc3cD08371400b9e4aaA941D13f7b1c48359A",
                "DNA00503":"0x5a65C2B397D2eD70B19BF834b3Ec00Bb53A52511",
                "DNA00504":"0x5a65C2B397D2eD70B19BF834b3Ec00Bb53A52511",
                "DNA00526":"0x17412Cd16821FC8b7aEec953b983fF5c52C4633e",
                "DNA00530":"0xD1ad298C5F5fa0CbDa3c5b50422330464408ec18",
                "DNA00532":"0xD1ad298C5F5fa0CbDa3c5b50422330464408ec18",
                "DNA00531":"0xD1ad298C5F5fa0CbDa3c5b50422330464408ec18",
                "DNA00521":"0xFD1A8AF8d807e5231c6cea8CB3A22849a2AB1Be5",
                "DNA00523":"0x13B0D0C9eA0e10b5563e3ec7a3990CFbaC0DE90B"}
  let clearingFirm="Wedbush"
  // ---Dev---
  // let accounts = {"ERIC":"0x7F884732187297B7d2856db3190D5f51087040c8",
  //   "ERIC2":"0x7F884732187297B7d2856db3190D5f51087040c8",
  //   "JUSTIN":"0x01D28924E57fe5d244BBDc9eB7cf51217728D9DF",
  //   "YASEEN":"0xa5fD2B747D284cC8e8f2FAF80ac1E49940a1321E"}
  // let clearingFirm="Dev"

  // Step 2: Mint initial accounts
  console.log(chalk.blue("=== Minting Initial Accounts ==="));
  let accountKeys = Object.keys(accounts);
  let mintedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < accountKeys.length; i++) {
    const accountName = accountKeys[i];
    const ownerAddress = accounts[accountName];

    try {
      const accountId = await myNFT.getTokenId(clearingFirm, accountName);
      if (accountId == ethers.parseUnits("0")) {
        const result = await executeWithRetry(
          async () => {
            const tx = await myNFT
              .connect(deployer)
              .mint(ownerAddress, clearingFirm, accountName, 0, 0, 0, 0, 1);
            await tx.wait(CONFIG.confirmations);
          },
          `Mint account ${accountName} to ${ownerAddress}`,
          myNFT.interface
        );
        if (result !== null) {
          mintedCount++;
        }
      } else {
        console.log(chalk.gray(`  ○ Account ${accountName} already exists (ID: ${accountId})`));
        skippedCount++;
      }
    } catch (err: any) {
      const errorMsg = err.reason || err.message || String(err);
      console.log(
        chalk.red(`✗ Failed to check/mint account ${accountName}: ${errorMsg}`)
      );
    }
  }

  console.log(
    chalk.cyan(
      `\nAccount minting complete: ${mintedCount} minted, ${skippedCount} skipped\n`
    )
  );

  // Step 3: Set Position NFT address
  console.log(chalk.blue("=== Setting Position NFT ==="));
  if (CONFIG.positionNFTAddress && CONFIG.positionNFTAddress != "") {
    await executeWithRetry(
      async () => {
        const tx = await myNFT.connect(deployer).setPositionNFT(CONFIG.positionNFTAddress);
        await tx.wait(CONFIG.confirmations);
      },
      `Set Position NFT to ${CONFIG.positionNFTAddress}`,
      myNFT.interface
    );
  } else {
    console.log(
      chalk.yellow(
        "⚠ No Position NFT address provided - will need to be set later"
      )
    );
  }

  // Step 4: Set controllers
  console.log(chalk.blue("\n=== Setting Controllers ==="));

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

  // Step 5: Transfer ownership
  console.log(chalk.blue("\n=== Transferring Ownership ==="));
  await executeWithRetry(
    async () => {
      const tx = await myNFT.connect(deployer).nominateNewOwner(keeperWallet);
      await tx.wait(CONFIG.confirmations);
    },
    `Nominate ${keeperWallet} as new owner`,
    myNFT.interface
  );

  // Remove deployer as controller (only if Position NFT is set)
  if (CONFIG.positionNFTAddress && CONFIG.positionNFTAddress != "") {
    await executeWithRetry(
      async () => {
        const tx = await myNFT.connect(deployer).setIsController(deployer.address, false);
        await tx.wait(CONFIG.confirmations);
      },
      "Remove deployer as controller",
      myNFT.interface
    );
  }

  // Step 6: Final verification
  console.log(chalk.blue("\n=== Deployment Summary ==="));
  console.log(chalk.green(`Contract: ${nftAddress}`));
  console.log(chalk.green(`Owner: ${await myNFT.owner()}`));
  console.log(chalk.green(`Nominated Owner: ${await myNFT.nominatedOwner()}`));
  console.log(chalk.green(`Accounts minted: ${mintedCount}`));
  if (CONFIG.positionNFTAddress) {
    console.log(chalk.green(`Position NFT: ${CONFIG.positionNFTAddress}`));
  }
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

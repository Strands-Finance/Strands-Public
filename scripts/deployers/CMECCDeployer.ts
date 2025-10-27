import { BaseDeployer } from "./BaseDeployer.js";
import { DeploymentConfig, BOOK_KEEPER_TYPE, GATE_KEEPER_TYPE, validateDeploymentConfig } from "../config/deploymentConfigs.js";
import { runDeployment, createDeploymentMain } from "../utils/deploymentRunner.js";
import { toBN } from "../utils/web3utils.js";

const CMECC_CONFIG: DeploymentConfig = {
  name: "CME Covered Call",
  symbol: "CMECC",
  folderName: "CmeCoveredCall",
  bookKeeperType: BOOK_KEEPER_TYPE.ACCOUNT_NFT_BOOK_KEEPER,
  gateKeeperType: GATE_KEEPER_TYPE.WHITELIST_GATE_KEEPER,
  depositAsset: "USDC",
  totalValueCap18: toBN("100000000", 18).toString(),
  licensingFeeRate: "0", // No license fee
  accountNFTTokenId: 10,
  includeExecutorInAUM: true,
  oracleFeeds: [
    {
      tokenSymbol: "USDC",
      feedType: "NETWORK_FEED",
      networkFeedSymbol: "USDC_USD",
      description: "USDC/USD price feed for deposit asset"
    }
  ]
};

/**
 * CME Covered Call deployer - Uses AccountNFT BookKeeper
 */
export class CMECCDeployer extends BaseDeployer {
  constructor() {
    validateDeploymentConfig(CMECC_CONFIG);
    super(CMECC_CONFIG);
  }
}

/**
 * Main entry point when running this file directly
 */
async function main() {
  const deployer = new CMECCDeployer();
  return runDeployment(deployer, "CME Covered Call", "prodSystemCMECC");
}

// Run deployment when executed via hardhat
createDeploymentMain(main);

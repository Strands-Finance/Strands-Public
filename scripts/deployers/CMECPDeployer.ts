import { BaseDeployer } from "./BaseDeployer.js";
import { DeploymentConfig, BOOK_KEEPER_TYPE, GATE_KEEPER_TYPE, validateDeploymentConfig } from "../config/deploymentConfigs.js";
import { runDeployment, createDeploymentMain } from "../utils/deploymentRunner.js";
import { toBN } from "../utils/web3utils.js";

const CMECP_CONFIG: DeploymentConfig = {
  name: "CME Covered Put",
  symbol: "CMECP",
  folderName: "CmeCoveredPut",
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
 * CME Covered Put deployer - Uses AccountNFT BookKeeper
 */
export class CMECPDeployer extends BaseDeployer {
  constructor() {
    validateDeploymentConfig(CMECP_CONFIG);
    super(CMECP_CONFIG);
  }
}

/**
 * Main entry point when running this file directly
 */
async function main() {
  const deployer = new CMECPDeployer();
  return runDeployment(deployer, "CME Covered Put", "prodSystemCMECP");
}

// Run deployment when executed via hardhat
createDeploymentMain(main);

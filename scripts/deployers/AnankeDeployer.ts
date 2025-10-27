import { BaseDeployer } from "./BaseDeployer.js";
import { DeploymentConfig, BOOK_KEEPER_TYPE, GATE_KEEPER_TYPE, validateDeploymentConfig } from "../config/deploymentConfigs.js";
import { runDeployment, createDeploymentMain } from "../utils/deploymentRunner.js";
import { toBN } from "../utils/web3utils.js";

const ANANKE_CONFIG: DeploymentConfig = {
  name: "Ananke",
  symbol: "ANANKE",
  folderName: "Ananke",
  bookKeeperType: BOOK_KEEPER_TYPE.DIRECT_INPUT_BOOK_KEEPER,
  gateKeeperType: GATE_KEEPER_TYPE.WHITELIST_GATE_KEEPER,
  depositAsset: "USDC",
  totalValueCap18: toBN("100000000", 18).toString(),
  licensingFeeRate: "0", // No license fee
  includeExecutorInAUM: false,
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
 * Ananke deployer - Uses USDC as deposit asset with DirectInput BookKeeper
 */
export class AnankeDeployer extends BaseDeployer {
  constructor() {
    validateDeploymentConfig(ANANKE_CONFIG);
    super(ANANKE_CONFIG);
  }
}

/**
 * Main entry point when running this file directly
 */
async function main() {
  const deployer = new AnankeDeployer();
  return runDeployment(deployer, "Ananke", "prodSystemAnanke");
}

// Run deployment when executed via hardhat
createDeploymentMain(main);
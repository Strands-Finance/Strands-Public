import { BaseDeployer } from "./BaseDeployer.js";
import { DeploymentConfig, BOOK_KEEPER_TYPE, GATE_KEEPER_TYPE, validateDeploymentConfig } from "../config/deploymentConfigs.js";
import { runDeployment, createDeploymentMain } from "../utils/deploymentRunner.js";
import { toBN } from "../utils/web3utils.js";

const SFP_CONFIG: DeploymentConfig = {
  name: "Segregated Fund Proxy",
  symbol: "SFP",
  folderName: "StrandsSFP",
  bookKeeperType: BOOK_KEEPER_TYPE.SIMPLE_BOOK_KEEPER,
  gateKeeperType: GATE_KEEPER_TYPE.WHITELIST_GATE_KEEPER,
  depositAsset: "API", // Uses StrandsAPI token
  totalValueCap18: toBN("1000000000", 18).toString(),
  licensingFeeRate: "0", // No license fee
  includeExecutorInAUM: false,
  oracleFeeds: [
    {
      tokenSymbol: "API",
      feedType: "CONSTANT_FEED",
      constantPrice: "100000000", // $1.00 USD with 8 decimals
      description: "API/USD constant price feed (1:1 USD peg)"
    }
  ]
};

/**
 * Segregated Fund Proxy deployer - Uses StrandsAPI token with Simple BookKeeper
 */
export class SFPDeployer extends BaseDeployer {
  constructor() {
    validateDeploymentConfig(SFP_CONFIG);
    super(SFP_CONFIG);
  }
}

/**
 * Main entry point when running this file directly
 */
async function main() {
  const deployer = new SFPDeployer();
  return runDeployment(deployer, "Segregated Fund Proxy", "prodSystemSFP");
}

// Run deployment when executed via hardhat
createDeploymentMain(main);

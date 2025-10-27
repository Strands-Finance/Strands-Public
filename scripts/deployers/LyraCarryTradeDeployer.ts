import { BaseDeployer } from "./BaseDeployer.js";
import { DeploymentConfig, BOOK_KEEPER_TYPE, GATE_KEEPER_TYPE, validateDeploymentConfig } from "../config/deploymentConfigs.js";
import { runDeployment, createDeploymentMain } from "../utils/deploymentRunner.js";
import { toBN } from "../utils/web3utils.js";

const LYRA_CT_CONFIG: DeploymentConfig = {
  name: "Lyra Carry Trade",
  symbol: "LYRACT",
  folderName: "LyraCarryTrade",
  bookKeeperType: BOOK_KEEPER_TYPE.DIRECT_INPUT_BOOK_KEEPER,
  gateKeeperType: GATE_KEEPER_TYPE.WHITELIST_GATE_KEEPER,
  depositAsset: "WETH",
  totalValueCap18: toBN("10000", 18).toString(),
  licensingFeeRate: "0", // No license fee
  includeExecutorInAUM: false,
  oracleFeeds: [
    {
      tokenSymbol: "WETH",
      feedType: "NETWORK_FEED",
      networkFeedSymbol: "ETH_USD",
      description: "ETH/USD price feed for deposit asset"
    }
  ]
};

/**
 * Lyra Carry Trade deployer - Uses WETH as deposit asset with DirectInput BookKeeper
 */
export class LyraCarryTradeDeployer extends BaseDeployer {
  constructor() {
    validateDeploymentConfig(LYRA_CT_CONFIG);
    super(LYRA_CT_CONFIG);
  }
}

/**
 * Main entry point when running this file directly
 */
async function main() {
  const deployer = new LyraCarryTradeDeployer();
  return runDeployment(deployer, "Lyra Carry Trade", "prodSystemLyraCT");
}

// Run deployment when executed via hardhat
createDeploymentMain(main);

import { toBN } from "../utils/web3utils.js";

// ============================================================================
// DEPLOYMENT CONFIGURATIONS
// ============================================================================

export enum BOOK_KEEPER_TYPE {
  DIRECT_INPUT_BOOK_KEEPER = "directInput",
  ACCOUNT_NFT_BOOK_KEEPER = "accountNFT",
  SIMPLE_BOOK_KEEPER = "simple"
}

export enum GATE_KEEPER_TYPE {
  WHITELIST_GATE_KEEPER = "whitelist",
  NFT_GATE_KEEPER = "nft",
  NONE = "none"
}

export interface OracleFeedConfig {
  /** Token address to add to watchlist (will be resolved during deployment) */
  tokenSymbol: "USDC" | "WETH" | "API" | string;
  /** Feed type - either use network feed or deploy our own */
  feedType: "NETWORK_FEED" | "CONSTANT_FEED" | "DEPLOYED_FEED";
  /** For NETWORK_FEED: which network feed to use (USDC_USD, ETH_USD) */
  networkFeedSymbol?: "USDC_USD" | "ETH_USD";
  /** For CONSTANT_FEED: constant price in USD (8 decimals) */
  constantPrice?: string;
  /** Human readable description */
  description: string;
}

export interface DeploymentConfig {
  /** Display name for the repository */
  name: string;
  /** Token symbol */
  symbol: string;
  /** Folder name for deployment artifacts */
  folderName: string;
  /** Type of BookKeeper to deploy */
  bookKeeperType: BOOK_KEEPER_TYPE;
  /** Type of GateKeeper to deploy */
  gateKeeperType: GATE_KEEPER_TYPE;
  /** Asset to use for deposits (USDC, WETH, API) */
  depositAsset: "USDC" | "WETH" | "API";
  /** Maximum total value cap in base units (18 decimals) */
  totalValueCap18: string;
  /** Licensing fee rate (18 decimals, e.g. "0.001" = 0.1%) */
  licensingFeeRate: string;
  /** Required AccountNFT token ID (for AccountNFT BookKeeper) */
  accountNFTTokenId?: number;
  /** Whether to include executor balance in AUM calculations */
  includeExecutorInAUM?: boolean;
  /** Oracle feeds to configure for this strategy */
  oracleFeeds: OracleFeedConfig[];
}

/**
 * Note: Deployment configurations are now defined in individual deployer files
 * (e.g., AnankeDeployer.ts, CMECCDeployer.ts, etc.) to make them easier to find and modify.
 */

/**
 * Network-specific address configurations
 */
export interface NetworkAddresses {
  usdcAddress?: string;
  wethAddress?: string;
  strandsAPIAddress?: string;
  accountNFTAddress?: string;
}

/**
 * Get network addresses from environment or return empty for deployment
 */
export function getNetworkAddresses(networkName: string): NetworkAddresses {
  // This could be expanded to read from config files per network
  // For now, we'll rely on the existing addressConfig pattern
  return {};
}

/**
 * Validation helpers
 */
export function validateDeploymentConfig(config: DeploymentConfig): void {
  if (!config.name || config.name.trim().length === 0) {
    throw new Error("Deployment config must have a valid name");
  }

  if (!config.symbol || config.symbol.trim().length === 0) {
    throw new Error("Deployment config must have a valid symbol");
  }

  if (!Object.values(BOOK_KEEPER_TYPE).includes(config.bookKeeperType)) {
    throw new Error(`Invalid BookKeeper type: ${config.bookKeeperType}`);
  }

  if (!Object.values(GATE_KEEPER_TYPE).includes(config.gateKeeperType)) {
    throw new Error(`Invalid GateKeeper type: ${config.gateKeeperType}`);
  }

  // Validate that AccountNFT BookKeeper has required tokenId
  if (config.bookKeeperType === BOOK_KEEPER_TYPE.ACCOUNT_NFT_BOOK_KEEPER && !config.accountNFTTokenId) {
    throw new Error("AccountNFT BookKeeper requires accountNFTTokenId to be specified");
  }

  // Validate numeric values
  try {
    BigInt(config.totalValueCap18);
  } catch {
    throw new Error(`Invalid totalValueCap18: ${config.totalValueCap18}`);
  }

  try {
    toBN(config.licensingFeeRate);
  } catch {
    throw new Error(`Invalid licensingFeeRate: ${config.licensingFeeRate}`);
  }

  // Validate oracle feeds configuration
  if (!config.oracleFeeds || config.oracleFeeds.length === 0) {
    throw new Error("Deployment config must have at least one oracle feed configured");
  }

  // Validate each oracle feed
  for (const feed of config.oracleFeeds) {
    if (!feed.tokenSymbol || !feed.feedType || !feed.description) {
      throw new Error("Oracle feed must have tokenSymbol, feedType, and description");
    }

    if (feed.feedType === "NETWORK_FEED" && !feed.networkFeedSymbol) {
      throw new Error("NETWORK_FEED oracle feeds must specify networkFeedSymbol");
    }

    if (feed.feedType === "CONSTANT_FEED" && !feed.constantPrice) {
      throw new Error("CONSTANT_FEED oracle feeds must specify constantPrice");
    }

    // Validate constant price if provided
    if (feed.constantPrice) {
      try {
        BigInt(feed.constantPrice);
      } catch {
        throw new Error(`Invalid constantPrice for oracle feed: ${feed.constantPrice}`);
      }
    }
  }

  // Ensure deposit asset has a corresponding oracle feed
  const depositAssetFeed = config.oracleFeeds.find(feed =>
    feed.tokenSymbol === config.depositAsset
  );
  if (!depositAssetFeed) {
    throw new Error(`No oracle feed configured for deposit asset: ${config.depositAsset}`);
  }
}
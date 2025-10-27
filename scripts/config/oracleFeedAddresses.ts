// ============================================================================
// ORACLE FEED ADDRESSES BY NETWORK
// ============================================================================

/**
 * Chainlink Price Feed addresses for different networks
 *
 * Sources:
 * - Ethereum: https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum
 * - Base: https://docs.chain.link/data-feeds/price-feeds/addresses?network=base
 * - Optimism: https://docs.chain.link/data-feeds/price-feeds/addresses?network=optimism
 * - Arbitrum: https://docs.chain.link/data-feeds/price-feeds/addresses?network=arbitrum
 */

export interface NetworkFeedAddresses {
  /** USDC/USD price feed address */
  USDC_USD: string;
  /** ETH/USD price feed address */
  ETH_USD: string;
  /** Network name for reference */
  networkName: string;
  /** Chain ID */
  chainId: string;
}

export const ORACLE_FEED_ADDRESSES: Record<string, NetworkFeedAddresses> = {
  // Ethereum Mainnet
  "1": {
    networkName: "Ethereum Mainnet",
    chainId: "1",
    USDC_USD: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", // USDC/USD 8 decimals
    ETH_USD: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"   // ETH/USD 8 decimals
  },

  // Base Mainnet
  "8453": {
    networkName: "Base Mainnet",
    chainId: "8453",
    USDC_USD: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B", // USDC/USD 8 decimals
    ETH_USD: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70"   // ETH/USD 8 decimals
  },

  // Optimism Mainnet
  "10": {
    networkName: "Optimism Mainnet",
    chainId: "10",
    USDC_USD: "0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3", // USDC/USD 8 decimals
    ETH_USD: "0x13e3Ee699D1909E989722E753853AE30b17e08c5"   // ETH/USD 8 decimals
  },

  // Arbitrum One
  "42161": {
    networkName: "Arbitrum One",
    chainId: "42161",
    USDC_USD: "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3", // USDC/USD 8 decimals
    ETH_USD: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612"   // ETH/USD 8 decimals
  },

  // Lyra Mainnet
  "957": {
    networkName: "Lyra Mainnet",
    chainId: "957",
    USDC_USD: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B", // USDC/USD 8 decimals (Base feeds used as reference)
    ETH_USD: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70"   // ETH/USD 8 decimals (Base feeds used as reference)
  },

  // Sepolia Testnet
  "11155111": {
    networkName: "Sepolia Testnet",
    chainId: "11155111",
    USDC_USD: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E", // USDC/USD 8 decimals
    ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306"   // ETH/USD 8 decimals
  },

  // Base Sepolia Testnet
  "84532": {
    networkName: "Base Sepolia Testnet",
    chainId: "84532",
    USDC_USD: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165", // USDC/USD 8 decimals
    ETH_USD: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1"   // ETH/USD 8 decimals
  },

  // Optimism Sepolia Testnet
  "11155420": {
    networkName: "Optimism Sepolia Testnet",
    chainId: "11155420",
    USDC_USD: "0x9BF91C91F2B5b1d2Dc2d0EFdE9EbD9cBd6DCe48b", // Mock/Test feed
    ETH_USD: "0x61Ec26aA57019C486B10502285c5A3D4A4750AD7"   // Mock/Test feed
  },

  // Arbitrum Sepolia Testnet
  "421614": {
    networkName: "Arbitrum Sepolia Testnet",
    chainId: "421614",
    USDC_USD: "0x0153002d20B96532C639313c2d54c3dA09109309", // Mock/Test feed
    ETH_USD: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165"   // Mock/Test feed
  },

  // Local Hardhat Network (uses mock feeds)
  "31337": {
    networkName: "Hardhat Local",
    chainId: "31337",
    USDC_USD: "0x0000000000000000000000000000000000000000", // Will be deployed during tests
    ETH_USD: "0x0000000000000000000000000000000000000000"   // Will be deployed during tests
  }
};

/**
 * Get oracle feed addresses for the current network
 */
export function getOracleFeedAddresses(chainId: string): NetworkFeedAddresses {
  const feedAddresses = ORACLE_FEED_ADDRESSES[chainId];

  if (!feedAddresses) {
    throw new Error(
      `No oracle feed addresses configured for chain ID: ${chainId}. ` +
      `Supported networks: ${Object.keys(ORACLE_FEED_ADDRESSES).map(id =>
        `${ORACLE_FEED_ADDRESSES[id].networkName} (${id})`
      ).join(', ')}`
    );
  }

  return feedAddresses;
}

/**
 * Get specific feed address by token symbol and chain ID
 */
export function getFeedAddress(chainId: string, tokenSymbol: "USDC" | "ETH"): string {
  const feedAddresses = getOracleFeedAddresses(chainId);

  switch (tokenSymbol) {
    case "USDC":
      return feedAddresses.USDC_USD;
    case "ETH":
      return feedAddresses.ETH_USD;
    default:
      throw new Error(`Unsupported token symbol: ${tokenSymbol}`);
  }
}

/**
 * Check if oracle feeds are available for a network
 */
export function isNetworkSupported(chainId: string): boolean {
  return chainId in ORACLE_FEED_ADDRESSES;
}

/**
 * Get all supported networks
 */
export function getSupportedNetworks(): NetworkFeedAddresses[] {
  return Object.values(ORACLE_FEED_ADDRESSES);
}

/**
 * Validate that feed addresses are properly configured for a network
 */
export function validateNetworkFeeds(chainId: string): void {
  const feedAddresses = getOracleFeedAddresses(chainId);

  // Skip validation for local networks (will use mock feeds)
  if (chainId === "31337") {
    return;
  }

  if (!feedAddresses.USDC_USD || feedAddresses.USDC_USD === "0x0000000000000000000000000000000000000000") {
    throw new Error(`USDC/USD feed address not configured for ${feedAddresses.networkName}`);
  }

  if (!feedAddresses.ETH_USD || feedAddresses.ETH_USD === "0x0000000000000000000000000000000000000000") {
    throw new Error(`ETH/USD feed address not configured for ${feedAddresses.networkName}`);
  }
}
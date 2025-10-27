// Get ethers through hardhat runtime
import { network } from "hardhat";
import { toBN } from "../helpers/testUtils.js";

// Lazy-loaded constants to avoid async issues at module load time
let _TEST_CONSTANTS: any = null;

export async function getTestConstants() {
  if (!_TEST_CONSTANTS) {
    const { ethers } = await network.connect();

    _TEST_CONSTANTS = {
      // Token configurations
      TOKENS: {
        USDC: {
          name: "USDC",
          symbol: "USDC",
          decimals: 6,
        },
        WETH: {
          name: "WETH",
          symbol: "WETH",
          decimals: 18,
        },
      },

      // Default amounts
      AMOUNTS: {
        MOCK_USDC_MINT: toBN("50000", 6),
        MOCK_USDC_LARGE_MINT: toBN("100000", 6),
        REPOSITORY_MAX_SUPPLY: toBN("100000000"),
        MINIMUM_FEE: toBN("0.01"),
        MINIMUM_LP_TOKENS: toBN("1"),
      },

      // Price feed configurations
      PRICE_FEEDS: {
        ETH_PRICE: toBN("2000"),
        USDC_PRICE: toBN("1", 8),
        ETH_DECIMALS: 18,
        USDC_DECIMALS: 8,
      },

      // NFT configurations
      STRANDS_250: {
        name: "First 250",
        symbol: "F250",
        maxSupply: 1,
        baseUri: "",
      },

      STRANDS_ACCOUNT: {
        name: "Strands Account NFT",
        symbol: "SA",
        baseUri: "https://pin.ski/41aSODW",
      },

      STRANDS_POSITION: {
        name: "Strands Position NFT",
        symbol: "SP",
        baseUri: "https://pin.ski/41aSODW",
      },

      // Repository configurations
      REPOSITORY: {
        tokenName: "StrandsRepositoryToken",
        tokenSymbol: "STK1",
      },

      // Test account configurations
      ACCOUNT_NFT: {
        firmName: "firm1",
        accountNumber: "account number 1",
        minBalance: ethers.parseEther("0"),
        maxBalance: ethers.parseEther("2"),
        maxDailyWithdraw: ethers.parseEther("2"),
        maxMonthlyWithdraw: ethers.parseEther("2"),
      },

      // Addresses
      ZERO_ADDRESS: "0x0000000000000000000000000000000000000000" as const,
    } as const;
  }

  return _TEST_CONSTANTS;
}

// Backward compatibility export
export const TEST_CONSTANTS = {
  get: getTestConstants
};
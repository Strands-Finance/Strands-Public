import "@nomiclabs/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import "@nomicfoundation/hardhat-chai-matchers";
import { extendEnvironment, HardhatUserConfig, task } from "hardhat/config";
import "solidity-coverage";
import "dotenv/config";
import "@nomicfoundation/hardhat-verify";
import "hardhat-contract-sizer";

const deployerPK = process.env.PRIVATE_KEY as string;
const ArbitrumApiKey = process.env.ARB_ETHERSCAN_KEY as string;
const OptimismApiKey = process.env.OP_ETHERSCAN_KEY as string;
const LyraApiKey = process.env.LYRA_SCAN_API_KEY as string;
const BaseApiKey = process.env.BASE_ETHERSCAN_KEY as string;

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          viaIR: true,
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
          optimizer: {
            enabled: true,
            runs: 20,
          },
        },
      },
      {
        version: "0.8.16",
        settings: {
          viaIR: true,
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
          optimizer: {
            enabled: true,
            runs: 20,
          },
        },
      },
      {
        version: "0.8.13",
        settings: {
          viaIR: true,
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
          optimizer: {
            enabled: true,
            runs: 20,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
    },
    local: {
      url: "http://127.0.0.1:8545",
      accounts: {
        mnemonic:
          "test-helpers test-helpers test-helpers test-helpers test-helpers test-helpers test-helpers test-helpers test-helpers test-helpers test-helpers junk",
      },
    },
    lyra: {
      url: "https://rpc.lyra.finance/",
      accounts: [
        deployerPK == undefined
          ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
          : deployerPK,
      ],
    },
    lyra_testnet: {
      url: "https://l2-prod-testnet-0eakp60405.t.conduit.xyz/",
      accounts: [
        deployerPK == undefined
          ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
          : deployerPK,
      ],
    },
    "mainnet-opti": {
      url:
        process.env.OP_ALCHEMY_KEY == undefined ||
          process.env.OP_ALCHEMY_KEY == ""
          ? "https://mainnet.optimism.io"
          : `https://opt-mainnet.g.alchemy.com/v2/${process.env.OP_ALCHEMY_KEY}`,
      accounts: [
        deployerPK == undefined
          ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
          : deployerPK,
      ],
    },
    "mainnet-arbi": {
      url:
        process.env.ARB_ALCHEMY_KEY == undefined
          ? "https://arbitrum.llamarpc.com"
          : `https://arb-mainnet.g.alchemy.com/v2/${process.env.ARB_ALCHEMY_KEY}`,
      accounts: [
        deployerPK == undefined
          ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
          : deployerPK,
      ],
    },
    "mainnet-base": {
      url:
        process.env.BASE_ALCHEMY_KEY == undefined
          ? "https://mainnet.base.org"
          : `https://base-mainnet.g.alchemy.com/v2/${process.env.BASE_ALCHEMY_KEY}`,
      accounts: [
        deployerPK == undefined
          ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
          : deployerPK,
      ],
    },
    "sepolia-arbi": {
      url:
        process.env.ARB_SEPOLIA_ALCHEMY_KEY == undefined
          ? "https://sepolia-rollup.arbitrum.io/rpc"
          : `https://arb-sepolia.g.alchemy.com/v2/${process.env.ARB_SEPOLIA_ALCHEMY_KEY}`,
      accounts: [
        deployerPK == undefined
          ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
          : deployerPK,
      ],
    },
    "sepolia-base": {
      url:
        process.env.BASE_SEPOLIA_ALCHEMY_KEY == undefined
          ? "https://sepolia.base.org"
          : `https://base-sepolia.g.alchemy.com/v2/${process.env.BASE_SEPOLIA_ALCHEMY_KEY}`,
      accounts: [
        deployerPK == undefined
          ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
          : deployerPK,
      ],
    },
    "sepolia-opti": {
      url:
        process.env.OP_SEPOLIA_ALCHEMY_KEY == undefined
          ? "https://sepolia.optimism.io/rpc"
          : `https://opt-sepolia.g.alchemy.com/v2/${process.env.OP_SEPOLIA_ALCHEMY_KEY}`,
      accounts: [
        deployerPK == undefined
          ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
          : deployerPK,
      ],
      gasPrice: 1000000000,
    },
    "sepolia-main": {
      url:
        process.env.SEPOLIA_ALCHEMY_KEY == undefined
          ? "https://ethereum-sepolia-rpc.publicnode.com"
          : `https://eth-sepolia.g.alchemy.com/v2/${process.env.SEPOLIA_ALCHEMY_KEY}`,
      accounts: [
        deployerPK == undefined
          ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
          : deployerPK,
      ],
    },
  },
  etherscan: {
    apiKey: {
      arbitrumOne: ArbitrumApiKey,
      "sepolia-arbi": ArbitrumApiKey,
      optimisticEthereum: OptimismApiKey,
      "sepolia-opti": OptimismApiKey,
      base: BaseApiKey,
      "sepolia-base": BaseApiKey,
      lyra: "abc",
      lyra_testnet: "abc",
      "sepolia-main": process.env.L1_ETHERSCAN_KEY || "",
      sepolia: process.env.L1_ETHERSCAN_KEY || "",
    },
    customChains: [
      {
        network: "sepolia-main",
        chainId: 11155111,
        urls: {
          apiURL: "https://api-sepolia.etherscan.io/api",
          browserURL: "https://sepolia.etherscan.io",
        },
      },
      {
        network: "sepolia-arbi",
        chainId: 421614,
        urls: {
          apiURL: "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia.arbiscan.io/",
        },
      },
      {
        network: "sepolia-opti",
        chainId: 11155420,
        urls: {
          apiURL: "https://api-sepolia-optimism.etherscan.io/api",
          browserURL: "https://sepolia-optimism.etherscan.io/",
        },
      },
      {
        network: "sepolia-base",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org/",
        },
      },
      {
        network: "lyra",
        chainId: 957,
        urls: {
          apiURL: "https://explorer.lyra.finance/api/",
          browserURL: "https://explorer.lyra.finance/",
        },
      },
      {
        network: "lyra_testnet",
        chainId: 901,
        urls: {
          apiURL:
            "https://explorerl2new-prod-testnet-0eakp60405.t.conduit.xyz/api/",
          browserURL:
            "https://explorerl2new-prod-testnet-0eakp60405.t.conduit.xyz/",
        },
      },
    ],
  },
  mocha: {
    timeout: 1_000_000,
  },
  sourcify: {
    enabled: false,
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    only: [
      'AccountNFTBookKeeper',
      'DirectInputBookKeeper',
      'Repository',
      'RepositoryFactory',
      'RepositoryToken',
      'StrandsAccount',
      'StrandsPosition'],
  },
};

extendEnvironment((hre) => {
  (hre as any).f = {
    SC: undefined,
    deploySnap: undefined,
  };
});

export default config;

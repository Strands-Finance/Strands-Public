import type { HardhatUserConfig, NetworkUserConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import "@nomicfoundation/hardhat-verify";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const deployerPK = process.env.PRIVATE_KEY as string;
const alchemyKey = process.env.ALCHEMY_KEY;
const etherscanApiKey = process.env.ETHERSCAN_KEY || "";

function createNetworkConfig(
  url: string,
  options: Partial<NetworkUserConfig> = {}
): NetworkUserConfig {
  return {
    type: "http",
    url,
    accounts: [deployerPK],
    allowUnlimitedContractSize: true,
    ...options,
  };
}

function getAlchemyUrl(alchemyPath: string, fallbackUrl: string): string {
  return alchemyKey ? `https://${alchemyPath}.g.alchemy.com/v2/${alchemyKey}` : fallbackUrl;
}

const config: HardhatUserConfig = {
  plugins: [hardhatEthers, hardhatToolboxMochaEthers],
  paths: {
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          viaIR: false,
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "shanghai",
          debug: {
            revertStrings: "default",
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      allowUnlimitedContractSize: true,
      mining: {
        auto: true,
        interval: 0,
      },
      allowBlocksWithSameTimestamp: true,
      accounts: {
        count: 11,
      },
      blockGasLimit: 30_000_000,
      gasPrice: 0,
      initialBaseFeePerGas: 0,
    },
    local: {
      type: "http",
      url: "http://127.0.0.1:8545",
      accounts: {
        mnemonic:
          "test-helpers test-helpers test-helpers test-helpers test-helpers test-helpers test-helpers test-helpers test-helpers test-helpers test-helpers junk",
      },
    },
    lyra: createNetworkConfig("https://rpc.lyra.finance/"),
    lyraTestnet: createNetworkConfig("https://l2-prod-testnet-0eakp60405.t.conduit.xyz/"),
    optimism: createNetworkConfig(
      getAlchemyUrl("opt-mainnet", "https://mainnet.optimism.io")
    ),
    arbitrumOne: createNetworkConfig(
      getAlchemyUrl("arb-mainnet", "https://arbitrum.llamarpc.com")
    ),
    base: createNetworkConfig(
      getAlchemyUrl("base-mainnet", "https://mainnet.base.org")
    ),
    sepolia: createNetworkConfig(
      getAlchemyUrl("eth-sepolia", "https://ethereum-sepolia-rpc.publicnode.com")
    ),
    arbitrumSepolia: createNetworkConfig(
      getAlchemyUrl("arb-sepolia", "https://sepolia-rollup.arbitrum.io/rpc")
    ),
    optimismSepolia: createNetworkConfig(
      getAlchemyUrl("opt-sepolia", "https://sepolia.optimism.io/rpc"),
      { gasPrice: 1000000000 }
    ),
    baseSepolia: createNetworkConfig(
      getAlchemyUrl("base-sepolia", "https://sepolia.base.org")
    ),
  },
  verify: {
    etherscan: {
      apiKey: etherscanApiKey,
    },
  },
  chainDescriptors: {
    11155111: {
      name: "sepolia",
      blockExplorers: {
        etherscan: {
          name: "Etherscan",
          url: "https://sepolia.etherscan.io",
          apiUrl: "https://api.etherscan.io/v2/api",
        },
      },
    },
    421614: {
      name: "arbitrumSepolia",
      blockExplorers: {
        etherscan: {
          name: "Etherscan",
          url: "https://sepolia.arbiscan.io/",
          apiUrl: "https://api.etherscan.io/v2/api",
        },
      },
    },
    11155420: {
      name: "optimismSepolia",
      blockExplorers: {
        etherscan: {
          name: "Etherscan",
          url: "https://sepolia-optimism.etherscan.io/",
          apiUrl: "https://api.etherscan.io/v2/api",
        },
      },
    },
    84532: {
      name: "baseSepolia",
      blockExplorers: {
        etherscan: {
          name: "Etherscan",
          url: "https://sepolia.basescan.org/",
          apiUrl: "https://api.etherscan.io/v2/api",
        },
      },
    },
    957: {
      name: "lyra",
      blockExplorers: {
        blockscout: {
          name: "Lyra Explorer",
          url: "https://explorer.lyra.finance/",
          apiUrl: "https://explorer.lyra.finance/api/",
        },
      },
    },
    901: {
      name: "lyraTestnet",
      blockExplorers: {
        blockscout: {
          name: "Lyra Testnet Explorer",
          url: "https://explorerl2new-prod-testnet-0eakp60405.t.conduit.xyz/",
          apiUrl: "https://explorerl2new-prod-testnet-0eakp60405.t.conduit.xyz/api/",
        },
      },
    },
  },
  mocha: {
    timeout: 300_000,
    reporter: "spec",
    bail: false,
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    only: [
      "AccountNFTBookKeeper",
      "DirectInputBookKeeper",
      "Repository",
      "RepositoryFactory",
      "RepositoryToken",
      "StrandsAccount",
      "StrandsPosition",
    ],
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;

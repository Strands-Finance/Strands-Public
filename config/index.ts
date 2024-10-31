import "dotenv/config";

interface AddressConfig {
  usdcAddress?: string;
  wethAddress?: string;
  apiAddress?: string;
}

export default {
  "sepolia-arbi": {
    usdcAddress: "0xf30040D9d454B1927c81065B07d886617Ee4fF37",
    wethAddress: "0x980b62da83eff3d4576c647993b0c1d7faf17c73",
  },
  "mainnet-arbi": {
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    wethAddress: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  },
  "sepolia-opti": {
    usdcAddress: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    wethAddress: "0x4200000000000000000000000000000000000006",
  },
  "mainnet-opti": {
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    wethAddress: "0x4200000000000000000000000000000000000006",
  },
  "sepolia-main": {
    usdcAddress: "0xE0FaF3FDF93C6bFa2886Cc3219E75d546A48d1AB",
    wethAddress: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  },
  "sepolia-base": {
    usdcAddress: "0xBCDeA8BE038D7e2BFE45B5063C178FFB912f42f3",
    wethAddress: "0x4200000000000000000000000000000000000006",
  },
  "mainnet-base": {
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    wethAddress: "0x4200000000000000000000000000000000000006",
  }

} as { [key: string]: AddressConfig };

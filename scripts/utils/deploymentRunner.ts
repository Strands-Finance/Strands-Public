import { BaseDeployer, ProdSystemContracts } from "../deployers/BaseDeployer.js";
import { verifyContractsFromFile } from "./etherscanVerify.js";
import { dumpDeploymentsToFile } from "./zip.js";

/**
 * Map chain IDs to network names used in hardhat.config.ts
 */
function getNetworkNameFromChainId(chainId: string): string {
  const chainIdMap: Record<string, string> = {
    "1": "mainnet",
    "10": "optimism",
    "8453": "base",
    "42161": "arbitrumOne",
    "11155111": "sepolia",
    "11155420": "optimismSepolia",
    "84532": "baseSepolia",
    "421614": "arbitrumSepolia",
    "31337": "hardhat"
  };

  const networkName = chainIdMap[chainId];
  if (!networkName) {
    console.warn(`Unknown chain ID: ${chainId}, skipping verification`);
    return "unknown";
  }

  return networkName;
}

/**
 * Standard deployment runner that handles deployment, dumping, and verification
 */
export async function runDeployment(
  deployer: BaseDeployer,
  systemName: string,
  deploymentFile: string
): Promise<ProdSystemContracts> {
  try {
    // Deploy the system
    const prodSystem = await deployer.deploy();

    console.log(`\n🎉 ${systemName} deployment completed successfully!`);

    // Dump deployments and verify contracts
    await dumpDeploymentsToFile(prodSystem, deploymentFile, "deployments");

    // Get network name from the deployed system's chainId
    const networkName = getNetworkNameFromChainId(prodSystem.chainId);
    await verifyContractsFromFile(`./${deploymentFile}.json`, networkName);

    return prodSystem;
  } catch (error) {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  }
}

/**
 * Wraps the main deployment function with error handling
 */
export function createDeploymentMain(mainFn: () => Promise<ProdSystemContracts>) {
  mainFn().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

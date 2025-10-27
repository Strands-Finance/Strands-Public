import fs from "fs";
import path from "path";
import chalk from "chalk";
import { ZeroAddress } from "ethers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ContractTransactionResponse, ContractTransactionReceipt } from "ethers";
import hre from "hardhat";

// In Hardhat v3 with ESM, ethers is available through network.connect()
const { ethers } = await hre.network.connect();

// Helper to get ethers
const getEthers = () => {
  return ethers;
};

// ============================================================================
// DEPLOYMENT UTILITIES
// ============================================================================

// ----------------------------------------------------------------------------
// Core Transaction Functions
// ----------------------------------------------------------------------------

/**
 * Executes a transaction with proper confirmation and error handling
 */
export async function safeTransaction(
  txPromise: Promise<ContractTransactionResponse>,
  description: string,
  confirmations: number = 2,
  timeout: number = 300000 // 5 minutes
): Promise<ContractTransactionReceipt> {
  console.log(chalk.yellow(`⏳ Executing: ${description}`));

  try {
    const txResponse = await txPromise;
    console.log(chalk.gray(`   Tx submitted: ${txResponse.hash}`));

    const receipt = await txResponse.wait(confirmations, timeout);

    if (!receipt || receipt.status !== 1) {
      throw new Error(`Transaction failed or was reverted`);
    }

    console.log(chalk.green(`✓ ${description}`));
    console.log(chalk.gray(`   Gas used: ${receipt.gasUsed.toLocaleString()}`));

    return receipt;
  } catch (error) {
    console.log(chalk.red(`✗ Failed: ${description}`));
    throw new DeploymentError("Transaction execution", description, error as Error);
  }
}

/**
 * Deploys a contract with proper error handling and validation
 */
export async function safeContractDeploy<T = any>(
  contractFactory: string,
  args: any[] = [],
  description?: string
): Promise<T> {
  const displayName = description || contractFactory;
  console.log(chalk.yellow(`⏳ Deploying: ${displayName}`));

  try {
    const contract = await getEthers().deployContract(contractFactory, args);
    await contract.waitForDeployment();

    const address = await contract.getAddress();
    console.log(chalk.green(`✓ ${displayName} deployed`));
    console.log(chalk.gray(`   Address: ${address}`));

    return contract as T;
  } catch (error) {
    console.log(chalk.red(`✗ Failed to deploy: ${displayName}`));
    throw new DeploymentError("Contract deployment", displayName, error as Error);
  }
}

// ----------------------------------------------------------------------------
// Retry and Reliability Functions
// ----------------------------------------------------------------------------

/**
 * Retry mechanism with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(chalk.blue(`⏳ ${operationName} (attempt ${attempt}/${maxRetries})`));
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        console.log(chalk.red(`✗ ${operationName} failed after ${maxRetries} attempts`));
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(chalk.yellow(`⚠ ${operationName} failed, retrying in ${delay}ms...`));
      console.log(chalk.gray(`   Error: ${error.message}`));

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error(`${operationName} failed after ${maxRetries} attempts: ${lastError!.message}`);
}

/**
 * Enhanced transaction execution with gas optimization
 */
export async function optimizedTransaction(
  txPromise: Promise<ContractTransactionResponse>,
  description: string,
  gasBufferPercent: number = 20
): Promise<any> {
  console.log(chalk.blue(`⛽ Estimating gas for: ${description}`));

  try {
    const tx = await txPromise;

    // Wait for confirmation with proper error handling
    const receipt = await retryOperation(
      async () => {
        const r = await tx.wait(2, 300000); // 2 confirmations, 5 min timeout
        if (!r || r.status !== 1) {
          throw new Error("Transaction failed or was reverted");
        }
        return r;
      },
      `Confirming transaction: ${description}`,
      3,
      2000
    );

    const gasUsed = receipt.gasUsed;
    const effectiveGasPrice = receipt.effectiveGasPrice || receipt.gasPrice || BigInt(0);
    const cost = gasUsed * effectiveGasPrice;

    console.log(chalk.green(`✓ ${description}`));
    console.log(chalk.gray(`   Gas used: ${gasUsed.toLocaleString()}`));
    console.log(chalk.gray(`   Cost: ${getEthers().formatEther(cost)} ETH`));

    return receipt;
  } catch (error) {
    console.log(chalk.red(`✗ Failed: ${description}`));
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Gas Estimation Functions
// ----------------------------------------------------------------------------

export interface GasEstimate {
  gasLimit: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  estimatedCost: bigint;
}

export async function estimateGasWithBuffer(
  transaction: any,
  bufferPercent: number = 20
): Promise<GasEstimate> {
  try {
    // Get gas estimate
    const gasEstimate = await getEthers().provider.estimateGas(transaction);
    const gasLimit = (gasEstimate * BigInt(100 + bufferPercent)) / BigInt(100);

    // Get current gas prices
    const feeData = await getEthers().provider.getFeeData();

    const result: GasEstimate = {
      gasLimit,
      estimatedCost: gasLimit * (feeData.gasPrice || BigInt(0))
    };

    // Add EIP-1559 fee data if available
    if (feeData.maxFeePerGas) {
      result.maxFeePerGas = feeData.maxFeePerGas;
      result.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || BigInt(0);
      result.estimatedCost = gasLimit * feeData.maxFeePerGas;
    }

    return result;
  } catch (error) {
    throw new Error(`Gas estimation failed: ${error.message}`);
  }
}

// ----------------------------------------------------------------------------
// Network Health Functions
// ----------------------------------------------------------------------------

/**
 * Network health checker
 */
export async function checkNetworkHealth(): Promise<{
  isHealthy: boolean;
  blockNumber: number;
  gasPrice: bigint;
  latency: number;
}> {
  const startTime = Date.now();

  try {
    const [blockNumber, feeData] = await Promise.all([
      getEthers().provider.getBlockNumber(),
      getEthers().provider.getFeeData()
    ]);

    const latency = Date.now() - startTime;
    const gasPrice = feeData.gasPrice || BigInt(0);

    const isHealthy = latency < 5000 && blockNumber > 0; // Less than 5s latency

    if (isHealthy) {
      console.log(chalk.green(`🌐 Network healthy - Block: ${blockNumber}, Latency: ${latency}ms`));
    } else {
      console.log(chalk.yellow(`⚠ Network issues detected - Latency: ${latency}ms`));
    }

    return { isHealthy, blockNumber, gasPrice, latency };
  } catch (error) {
    console.log(chalk.red(`❌ Network health check failed: ${error.message}`));
    return { isHealthy: false, blockNumber: 0, gasPrice: BigInt(0), latency: 9999 };
  }
}

/**
 * Wait for network to be ready
 */
export async function waitForNetwork(maxWaitTime: number = 30000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const health = await checkNetworkHealth();

    if (health.isHealthy) {
      return;
    }

    console.log(chalk.yellow("⏳ Waiting for network to be ready..."));
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error(`Network not ready after ${maxWaitTime}ms`);
}

// ----------------------------------------------------------------------------
// Batch Processing Functions
// ----------------------------------------------------------------------------

/**
 * Batch transaction execution with rate limiting
 */
export async function executeBatchTransactions<T>(
  transactions: Array<() => Promise<T>>,
  batchSize: number = 3,
  delayBetweenBatches: number = 1000
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    console.log(chalk.blue(`📦 Executing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(transactions.length / batchSize)}`));

    const batchResults = await Promise.all(
      batch.map(tx => retryOperation(tx, `Batch transaction ${i + 1}`, 2))
    );

    results.push(...batchResults);

    // Delay between batches to avoid overwhelming the network
    if (i + batchSize < transactions.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return results;
}

// ----------------------------------------------------------------------------
// State Management
// ----------------------------------------------------------------------------

export interface DeploymentState {
  deploymentName: string;
  chainId: string;
  step: string;
  timestamp: number;
  deployedContracts: Record<string, {
    address: string;
    txHash: string;
    blockNumber: number;
  }>;
  environment: {
    deployer: string;
    controller: string;
    networkName: string;
  };
  metadata: Record<string, any>;
}

export class DeploymentStateManager {
  private stateDir: string;
  private stateFile: string;

  constructor(private deploymentName: string, private chainId: string) {
    this.stateDir = path.join(process.cwd(), "deployment-states");
    this.stateFile = path.join(this.stateDir, `${deploymentName}-${chainId}.json`);

    // Ensure state directory exists
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
  }

  async saveState(state: Partial<DeploymentState>): Promise<void> {
    try {
      const existingState = await this.loadState();
      const updatedState: DeploymentState = {
        deploymentName: this.deploymentName,
        chainId: this.chainId,
        timestamp: Date.now(),
        deployedContracts: {},
        environment: { deployer: "", controller: "", networkName: "" },
        metadata: {},
        step: "unknown",
        ...existingState,
        ...state
      };

      await fs.promises.writeFile(
        this.stateFile,
        JSON.stringify(updatedState, null, 2)
      );

      console.log(chalk.gray(`💾 State saved: ${state.step || 'unknown step'}`));
    } catch (error) {
      console.log(chalk.yellow(`⚠ Failed to save deployment state: ${error.message}`));
    }
  }

  async loadState(): Promise<DeploymentState | null> {
    try {
      if (!fs.existsSync(this.stateFile)) {
        return null;
      }

      const data = await fs.promises.readFile(this.stateFile, 'utf-8');
      const state = JSON.parse(data) as DeploymentState;

      console.log(chalk.blue(`📂 Loaded existing deployment state from step: ${state.step}`));
      console.log(chalk.gray(`   Contracts deployed: ${Object.keys(state.deployedContracts).length}`));

      return state;
    } catch (error) {
      console.log(chalk.yellow(`⚠ Failed to load deployment state: ${error.message}`));
      return null;
    }
  }

  async clearState(): Promise<void> {
    try {
      if (fs.existsSync(this.stateFile)) {
        await fs.promises.unlink(this.stateFile);
        console.log(chalk.green("🗑️ Deployment state cleared"));
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠ Failed to clear deployment state: ${error.message}`));
    }
  }

  getContractAddress(contractName: string): string | null {
    const state = this.loadStateSync();
    return state?.deployedContracts[contractName]?.address || null;
  }

  private loadStateSync(): DeploymentState | null {
    try {
      if (!fs.existsSync(this.stateFile)) {
        return null;
      }
      const data = fs.readFileSync(this.stateFile, 'utf-8');
      return JSON.parse(data) as DeploymentState;
    } catch {
      return null;
    }
  }
}

// ----------------------------------------------------------------------------
// Validation Functions
// ----------------------------------------------------------------------------

/**
 * Custom error class for deployment failures
 */
export class DeploymentError extends Error {
  constructor(
    public step: string,
    public details: string,
    public cause?: Error
  ) {
    super(`Deployment failed at ${step} (${details}): ${cause?.message || 'Unknown error'}`);
    this.name = 'DeploymentError';
  }
}

/**
 * Validates an Ethereum address
 */
export function validateAddress(address: string, name: string): void {
  if (!address) {
    throw new DeploymentError("Address validation", name, new Error("Address is empty"));
  }

  // Check format: 0x followed by 40 hex characters
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new DeploymentError("Address validation", name, new Error(`Invalid address format: ${address}`));
  }

  // Check it's not zero address (case insensitive)
  if (address.toLowerCase() === ZeroAddress.toLowerCase()) {
    throw new DeploymentError("Address validation", name, new Error("Address cannot be zero address"));
  }
}

/**
 * Validates environment variables required for deployment
 */
export interface DeploymentEnvironment {
  controllerWallet: string;
  deployerAddress: string;
  networkName: string;
  chainId: string;
}

export async function validateEnvironment(): Promise<DeploymentEnvironment> {
  const controllerWallet = process.env.CONTROLLER_WALLET;
  if (!controllerWallet) {
    throw new DeploymentError("Environment validation", "CONTROLLER_WALLET",
      new Error("CONTROLLER_WALLET environment variable is required"));
  }

  validateAddress(controllerWallet, "CONTROLLER_WALLET");

  const [deployerSigner] = await getEthers().getSigners();
  const deployerAddress = await deployerSigner.getAddress();
  const network = await getEthers().provider.getNetwork();

  return {
    controllerWallet,
    deployerAddress,
    networkName: network.name,
    chainId: network.chainId.toString()
  };
}

/**
 * Validates that a contract has been properly initialized
 */
export async function validateContractState(
  contract: any,
  expectedState: Record<string, any>,
  contractName: string
): Promise<void> {
  console.log(chalk.blue(`🔍 Validating ${contractName} state...`));

  for (const [property, expectedValue] of Object.entries(expectedState)) {
    try {
      const actualValue = await contract[property]();

      if (actualValue !== expectedValue && actualValue.toString() !== expectedValue.toString()) {
        throw new Error(`${property}: expected ${expectedValue}, got ${actualValue}`);
      }

      console.log(chalk.gray(`   ✓ ${property}: ${actualValue}`));
    } catch (error) {
      throw new DeploymentError("State validation", `${contractName}.${property}`, error as Error);
    }
  }

  console.log(chalk.green(`✓ ${contractName} state validation passed`));
}

// ----------------------------------------------------------------------------
// Utility Functions
// ----------------------------------------------------------------------------

/**
 * Contract verification helper
 */
export async function verifyContractCode(
  contractAddress: string,
  expectedBytecode: string
): Promise<boolean> {
  try {
    const deployedBytecode = await getEthers().provider.getCode(contractAddress);

    // Remove metadata hash for comparison (last 86 bytes)
    const normalizeCode = (code: string) => {
      if (code.length > 86) {
        return code.slice(0, -86);
      }
      return code;
    };

    const isValid = normalizeCode(deployedBytecode) === normalizeCode(expectedBytecode);

    if (isValid) {
      console.log(chalk.green(`✓ Contract bytecode verified: ${contractAddress}`));
    } else {
      console.log(chalk.red(`✗ Contract bytecode mismatch: ${contractAddress}`));
    }

    return isValid;
  } catch (error) {
    console.log(chalk.red(`✗ Bytecode verification failed: ${error.message}`));
    return false;
  }
}

/**
 * Waits for a condition to be true with timeout
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  description: string,
  timeout: number = 30000,
  interval: number = 1000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      console.log(chalk.green(`✓ Condition met: ${description}`));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new DeploymentError("Condition timeout", description,
    new Error(`Condition not met within ${timeout}ms`));
}

/**
 * Checks if we're on a test network
 */
export function isTestNetwork(): boolean {
  const testNetworks = ['hardhat', 'localhost', 'sepolia', 'goerli'];
  return testNetworks.some(network =>
    process.env.HARDHAT_NETWORK?.includes(network) ||
    process.env.NODE_ENV === 'test'
  );
}

/**
 * Deployment summary reporter
 */
export function generateDeploymentSummary(
  startTime: number,
  contracts: Record<string, string>,
  totalGasCost: bigint
): void {
  const duration = Date.now() - startTime;
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);

  console.log(chalk.cyan("\n📊 DEPLOYMENT SUMMARY"));
  console.log(chalk.cyan("════════════════════════════════════════"));

  console.log(chalk.blue(`⏱️  Duration: ${minutes}m ${seconds}s`));
  console.log(chalk.blue(`⛽ Total Gas Cost: ${getEthers().formatEther(totalGasCost)} ETH`));
  console.log(chalk.blue(`📦 Contracts Deployed: ${Object.keys(contracts).length}`));

  console.log(chalk.white("\n📋 Contract Addresses:"));
  for (const [name, address] of Object.entries(contracts)) {
    console.log(chalk.gray(`   ${name}: ${address}`));
  }

  console.log(chalk.cyan("════════════════════════════════════════\n"));
}

// ----------------------------------------------------------------------------
// Logging Helper
// ----------------------------------------------------------------------------

/**
 * Logs deployment progress with step counter
 */
export class DeploymentLogger {
  private currentStep = 0;

  constructor(private totalSteps: number, private context: string) {}

  step(message: string): void {
    this.currentStep++;
    console.log(chalk.blue(`\n[${this.currentStep}/${this.totalSteps}] ${this.context}: ${message}`));
  }

  info(message: string): void {
    console.log(chalk.gray(`   ${message}`));
  }

  success(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
  }

  error(message: string): void {
    console.log(chalk.red(`✗ ${message}`));
  }

  warn(message: string): void {
    console.log(chalk.yellow(`⚠ ${message}`));
  }
}

// ----------------------------------------------------------------------------
// NFT Deployment Helpers
// ----------------------------------------------------------------------------

/**
 * Decodes custom errors from contract interfaces
 */
export function decodeCustomError(errorData: string, contractInterface: any): string | null {
  try {
    const decodedError = contractInterface.parseError(errorData);
    if (decodedError) {
      const args = decodedError.args.length > 0
        ? `(${decodedError.args.join(', ')})`
        : '()';
      return `${decodedError.name}${args}`;
    }
  } catch {}
  return null;
}

/**
 * Executes transactions with detailed error reporting and custom error decoding
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  description: string,
  contractInterface?: any,
  maxRetries = 1
): Promise<T | null> {
  try {
    const result = await fn();
    console.log(chalk.green(`✓ ${description}`));
    return result;
  } catch (err: any) {
    let errorMsg = err.reason || err.message || String(err);
    const errorData = err.data || err.error?.data || err.error?.error?.data;

    if (errorData && contractInterface) {
      const decodedError = decodeCustomError(errorData, contractInterface);
      if (decodedError) {
        errorMsg = `${decodedError}`;
        if (decodedError.startsWith('AlreadyExists') || decodedError.includes('AlreadySet')) {
          console.log(chalk.gray(`  ○ ${description} - already set`));
          return null;
        }
      } else if (typeof errorData === 'string' && errorData.startsWith('0x')) {
        const errorSig = errorData.slice(0, 10);
        errorMsg += ` [Unrecognized error: ${errorSig}]`;
      }
    }

    if (err.error?.message) {
      errorMsg = err.error.message;
    }

    console.log(chalk.red(`✗ ${description} failed: ${errorMsg}`));
    return null;
  }
}

/**
 * Simpler version without custom error decoding (for contracts without custom errors)
 */
export async function executeWithRetrySimple<T>(
  fn: () => Promise<T>,
  description: string,
  maxRetries = 1
): Promise<T | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await fn();
      console.log(chalk.green(`✓ ${description}`));
      return result;
    } catch (err) {
      console.log(
        chalk.yellow(
          `⚠ ${description} failed (attempt ${i + 1}/${maxRetries}): ${err}`
        )
      );
      if (i === maxRetries - 1) {
        console.log(chalk.red(`✗ ${description} failed after ${maxRetries} attempts`));
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
  return null;
}
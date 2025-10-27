# Strands Contracts Deployment Framework

This document provides comprehensive guidance on using the advanced deployment framework for Strands contracts. The framework has been designed for reliability, consistency, and ease of use across all deployment scenarios.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Available Strategies](#available-strategies)
- [CLI Usage](#cli-usage)
- [Configuration](#configuration)
- [Advanced Features](#advanced-features)
- [Error Handling](#error-handling)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

1. **Environment Setup:**

   ```bash
   # Copy and configure environment variables
   cp .env.example .env

   # Set required variables in .env:
   # CONTROLLER_WALLET=0x...
   # PRIVATE_KEY=...
   # ETHERSCAN_API_KEY=...
   ```

2. **Install Dependencies:**

   ```bash
   npm install
   ```

3. **Compile Contracts:**
   ```bash
   npm run build
   ```

### Deploy Single Strategy

```bash
# List available deployment strategies
npm run deploy:list

# Deploy specific strategy
npm run deploy:cmecc     # CME Covered Call
npm run deploy:cmecp     # CME Covered Put
npm run deploy:lyra      # Lyra Carry Trade
npm run deploy:ananke    # Ananke
npm run deploy:sfp       # Segregated Fund Proxy

# Deploy all strategies
npm run deploy:all
```

### Using the CLI Directly

```bash
# Show help and available commands
npm run deploy

# Deploy with custom options
npm run deploy deploy cmecc --no-verify --no-dump
```

## Architecture

### Core Components

The deployment framework is built on a modular architecture:

```
scripts/
├── deploy.ts                    # CLI interface
├── deployers/                   # Strategy-specific deployers
│   ├── BaseDeployer.ts         # Base deployment logic
│   ├── CMECCDeployer.ts        # CME Covered Call
│   ├── CMECPDeployer.ts        # CME Covered Put
│   ├── LyraCarryTradeDeployer.ts
│   ├── AnankeDeployer.ts
│   └── SFPDeployer.ts
├── config/
│   └── deploymentConfigs.ts    # Centralized configurations
└── utils/
    ├── deploymentUtils.ts      # Core deployment utilities
```

### Deployment Process

Each deployment follows a standardized 13-step process:

1. **Environment Validation** - Verify deployer and controller addresses
2. **Network Health Check** - Ensure network is responsive
3. **Token Deployment** - Deploy or connect to existing tokens (USDC/WETH/API)
4. **Repository Factory** - Deploy or connect to RepositoryFactory
5. **BookKeeper Deployment** - Deploy strategy-specific BookKeeper
6. **GateKeeper Deployment** - Deploy WhitelistGateKeeper or NFTGateKeeper
7. **Repository Creation** - Create Repository via RepositoryFactory
8. **Repository Initialization** - Initialize with strategy parameters
9. **BookKeeper Initialization** - Link BookKeeper to Repository
10. **Oracle Feed Configuration** - Deploy and configure price feeds per strategy
11. **RepositoryToken Deployment** - Deploy and link RepositoryToken
12. **Ownership Transfer** - Transfer ownership to controller
13. **Final Validation** - Verify all components are properly configured

## Available Strategies

### CME Covered Call (CMECC)

- **BookKeeper:** AccountNFTBookKeeper
- **GateKeeper:** NFTGateKeeper
- **Base Token:** WETH
- **Description:** CME-based covered call options strategy

### CME Covered Put (CMECP)

- **BookKeeper:** AccountNFTBookKeeper
- **GateKeeper:** NFTGateKeeper
- **Base Token:** USDC
- **Description:** CME-based covered put options strategy

### Lyra Carry Trade

- **BookKeeper:** DirectInputBookKeeper
- **GateKeeper:** WhitelistGateKeeper
- **Base Token:** WETH
- **Description:** Lyra protocol carry trade strategy

### Ananke

- **BookKeeper:** DirectInputBookKeeper
- **GateKeeper:** WhitelistGateKeeper
- **Base Token:** USDC
- **Description:** Singularity Fund I strategy

### Segregated Fund Proxy (SFP)

- **BookKeeper:** SimpleBookKeeper
- **GateKeeper:** WhitelistGateKeeper
- **Base Token:** StrandsAPI
- **Description:** Strands segregated fund proxy

## CLI Usage

### Command Reference

```bash
# List all available strategies
npm run deploy list

# Deploy specific strategy
npm run deploy deploy <strategy> [options]

# Deploy all strategies
npm run deploy all [options]

# Show help
npm run deploy --help
```

### Options

- `--no-verify` - Skip contract verification on Etherscan
- `--no-dump` - Skip saving deployment data to JSON files

### Examples

```bash
# Deploy CME Covered Call with verification
npm run deploy:cmecc

# Deploy Ananke without contract verification
npm run deploy deploy ananke --no-verify

# Deploy all strategies without saving deployment files
npm run deploy all --no-dump

# Deploy SFP with all features enabled (default)
npm run deploy:sfp
```

## Configuration

### Deployment Configurations

All strategy configurations are centralized in `scripts/config/deploymentConfigs.ts`:

```typescript
export const DEPLOYMENT_CONFIGS: Record<string, DeploymentConfig> = {
  CmeCoveredCall: {
    name: "CME Covered Call",
    symbol: "CMECC",
    bookKeeperType: BOOK_KEEPER_TYPE.ACCOUNT_NFT_BOOK_KEEPER,
    gateKeeperType: GATE_KEEPER_TYPE.NFT_GATE_KEEPER,
    baseTokenType: BASE_TOKEN_TYPE.WETH,
    // ... additional configuration
  },
  // ... other strategies
};
```

### Environment Variables

Required variables in `.env`:

```bash
# Deployment
CONTROLLER_WALLET=0x...           # Controller wallet address
PRIVATE_KEY=...                   # Deployer private key

# Oracle feeds are automatically configured per network
# No manual feed addresses needed - handled by oracleFeedAddresses.ts

# Network-specific (optional)
ETHERSCAN_API_KEY=...            # For contract verification
POLYGONSCAN_API_KEY=...          # For Polygon deployments
ARBISCAN_API_KEY=...             # For Arbitrum deployments

# Custom addresses (optional)
USDC_ADDRESS=0x...               # Use existing USDC instead of mock
WETH_ADDRESS=0x...               # Use existing WETH instead of mock
```

### Network Configuration

The framework automatically adapts to different networks based on Hardhat configuration. Supported networks include:

- **Ethereum Mainnet**
- **Optimism**
- **Lyra**
- **Arbitrum**
- **Base**
- **Local Hardhat**
- **Testnets** (Sepolia, Mumbai, etc.)

## Oracle Feed Configuration

The deployment framework automatically configures price feeds for each strategy based on their requirements.

### Feed Types

1. **NETWORK_FEED**: Uses existing Chainlink price feeds

   - Automatically selects correct feed address based on network
   - Supports: Ethereum, Base, Optimism, Arbitrum, Polygon, and testnets

2. **CONSTANT_FEED**: Deploys ConstantPriceFeed contract

   - Used for assets pegged to USD (like API tokens)
   - Price specified in 8-decimal format (e.g., "100000000" = $1.00)

3. **DEPLOYED_FEED**: Custom deployed feed contracts (future feature)

### Per-Strategy Configuration

Each strategy automatically configures the required feeds:

- **CME Strategies**: USDC/USD feed for deposit asset pricing
- **Lyra Carry Trade**: ETH/USD feed for WETH deposit asset
- **Ananke**: USDC/USD feed for USDC deposit asset
- **Segregated Fund Proxy**: Custom ConstantPriceFeed for API token (1:1 USD)

### Adding Custom Feeds

To add additional feeds to a strategy, modify the `oracleFeeds` array in `deploymentConfigs.ts`:

```typescript
oracleFeeds: [
  {
    tokenSymbol: "USDC",
    feedType: "NETWORK_FEED",
    networkFeedSymbol: "USDC_USD",
    description: "USDC/USD price feed",
  },
  {
    tokenSymbol: "CUSTOM_TOKEN",
    feedType: "CONSTANT_FEED",
    constantPrice: "200000000", // $2.00
    description: "Custom token constant price",
  },
];
```

### Supported Networks

The framework automatically uses the correct Chainlink feeds for:

- **Ethereum Mainnet** (Chain ID: 1)
- **Base Mainnet** (Chain ID: 8453)
- **Optimism Mainnet** (Chain ID: 10)
- **Arbitrum One** (Chain ID: 42161)
- **Lyra Mainnet** (Chain ID: 957)
- **Sepolia Testnet** (Chain ID: 11155111)
- **Base Sepolia** (Chain ID: 84532)
- **Optimism Sepolia** (Chain ID: 11155420)
- **Arbitrum Sepolia** (Chain ID: 421614)

Feed addresses are maintained in `scripts/config/oracleFeedAddresses.ts`.

## Advanced Features

### State Persistence

The framework includes sophisticated state management:

```typescript
// Automatic state saving during deployment
await stateManager.saveState({
  step: "repository-deployment",
  deployedContracts: { repository: "0x..." },
});

// Automatic recovery on failure
const existingState = await stateManager.loadState();
if (existingState) {
  console.log(`Resuming from step: ${existingState.step}`);
}
```

### Retry Mechanisms

Automatic retry with exponential backoff:

```typescript
// Retry failed transactions up to 3 times with increasing delays
await retryOperation(
  () => contract.someMethod(),
  "Method execution",
  3, // max retries
  1000 // base delay in ms
);
```

### Gas Optimization

Intelligent gas estimation and optimization:

```typescript
// Automatic gas estimation with 20% buffer
const gasEstimate = await estimateGasWithBuffer(transaction, 20);

// EIP-1559 support with automatic fee calculation
const receipt = await optimizedTransaction(
  contractDeployment,
  "Contract deployment"
);
```

### Network Health Monitoring

Pre-deployment network validation:

```typescript
// Check network responsiveness before deployment
const health = await checkNetworkHealth();
if (!health.isHealthy) {
  await waitForNetwork(30000); // Wait up to 30 seconds
}
```

### Batch Transaction Processing

Rate-limited batch processing to avoid overwhelming networks:

```typescript
// Process transactions in batches of 3 with 1s delays
const results = await executeBatchTransactions(
  transactions,
  3, // batch size
  1000 // delay between batches
);
```

## Error Handling

### Transaction Failures

The framework provides comprehensive error handling:

1. **Automatic Retries** - Failed transactions are automatically retried up to 3 times
2. **State Recovery** - Deployments can resume from the last successful step
3. **Detailed Logging** - All errors include context and troubleshooting hints
4. **Graceful Degradation** - Non-critical failures don't stop the entire deployment

### Common Error Scenarios

#### Insufficient Gas

```bash
Error: Gas estimation failed
Solution: Increase gas limit or check network congestion
```

#### Network Timeouts

```bash
Error: Network not ready after 30000ms
Solution: Check network connectivity or try again later
```

#### Contract Verification Failures

```bash
Error: Etherscan verification failed
Solution: Check ETHERSCAN_API_KEY or use --no-verify flag
```

#### Address Conflicts

```bash
Error: Contract already deployed at address
Solution: Clear deployment state or use existing contracts
```

## Troubleshooting

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
# Set debug environment variable
DEBUG=strands:deploy npm run deploy:cmecc
```

### Managing Deployment Files

The framework tracks deployed contracts in `deployments/` folder with JSON files per network chain:

```
deployments/
├── Ananke/
│   ├── Repository-deployments.json      # {"11155111": "0x123...", "1": "0x456..."}
│   ├── BookKeeper/
│   │   └── BookKeeper-deployments.json
│   └── GateKeeper/
│       └── GateKeeper-deployments.json
└── RepositoryFactory/
    └── RepositoryFactory-deployments.json
```

**Redeployment Behavior:**

- **First deployment:** Deploys all fresh contracts, initializes them, saves addresses
- **Re-running on same chain:** Loads existing contracts, skips initialization if already done
- **Force fresh deployment:** Remove the specific chain's address from JSON file

**Example - Redeploy Ananke on Sepolia (chain ID 11155111):**

```bash
# Option 1: Remove just Sepolia entry (RECOMMENDED)
# Edit deployments/Ananke/Repository-deployments.json:
# Change: {"11155111": "0x123...", "42161": "0x456..."}
# To: {"42161": "0x456..."}

# Option 2: Delete entire folder (removes ALL chains - not recommended)
rm -rf deployments/Ananke
```

**Smart Initialization Skipping:**

The framework automatically skips initialization when:
- Repository already has a BookKeeper set
- BookKeeper already initialized with any Repository
- RepositoryToken already linked to Repository
- Ownership already transferred

This prevents "Wrong repository" errors and allows safe re-runs.

### Clear Deployment State

If a deployment gets stuck, clear the state:

```bash
# Remove deployment state files
rm -rf deployment-states/

# Or clear specific deployment
rm deployment-states/CmeCoveredCall-1.json
```

### Network Issues

For network-related problems:

1. **Check Network Status:**

   ```bash
   npm run deploy deploy cmecc --no-verify --no-dump
   ```

2. **Verify Environment:**

   ```bash
   # Check if addresses are valid
   echo $CONTROLLER_WALLET

   # Test network connectivity
   npx hardhat console --network mainnet
   ```

3. **Use Local Network:**

   ```bash
   # Start local Hardhat network
   npx hardhat node

   # Deploy to local network
   npx hardhat run scripts/deploy.ts --network localhost
   ```

### Contract Verification Issues

If contract verification fails:

1. **Check API Keys:**

   ```bash
   # Verify API key is set
   echo $ETHERSCAN_API_KEY
   ```

2. **Manual Verification:**

   ```bash
   # Verify contracts manually after deployment
   npx hardhat verify --network mainnet CONTRACT_ADDRESS
   ```

3. **Skip Verification:**
   ```bash
   # Deploy without verification
   npm run deploy deploy cmecc --no-verify
   ```

### Performance Optimization

For faster deployments:

1. **Use Existing Contracts:**

   - Set addresses in environment variables to reuse existing contracts
   - The framework automatically detects and reuses compatible contracts

2. **Parallel Deployments:**

   ```bash
   # Deploy multiple strategies in parallel (advanced)
   npm run deploy:cmecc & npm run deploy:lyra & wait
   ```

3. **Local Testing:**
   ```bash
   # Test deployments locally first
   npx hardhat node &
   npm run deploy:cmecc --network localhost
   ```

## Support

For additional support:

1. **Check Logs** - All deployments generate detailed logs with timestamps
2. **Review State Files** - Check `deployment-states/` for saved progress
3. **Verify Configuration** - Ensure all environment variables are correctly set
4. **Test Locally** - Always test deployments on local networks first

The deployment framework is designed to be robust and self-recovering. Most issues can be resolved by simply re-running the deployment command, as the framework will automatically resume from the last successful step.

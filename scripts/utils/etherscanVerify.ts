import hre from 'hardhat';
import { exec } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Helper to run verify command via CLI
async function runVerify(address: string, contract: string | undefined, constructorArgs: any[], networkName: string): Promise<string> {
  // Build the command
  let cmd = `npx hardhat verify --network ${networkName} `;

  if (contract) {
    cmd += `--contract ${contract} `;
  }

  cmd += `${address}`;

  // Add constructor args as positional parameters
  for (const arg of constructorArgs) {
    // Escape strings with spaces
    const argStr = String(arg);
    if (argStr.includes(' ')) {
      cmd += ` "${argStr}"`;
    } else {
      cmd += ` ${argStr}`;
    }
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 1024 * 1024 });
    return stdout + stderr;
  } catch (error: any) {
    // exec throws on non-zero exit codes, but we want to capture the output
    return error.stdout + error.stderr;
  }
}

export const verifyContractsFromFile = async (filePath: string, networkName: string) => {
  try {
    const fileData = fs.readFileSync(filePath, 'utf-8');
    const contracts = JSON.parse(fileData);

    for (const contractKey of Object.keys(contracts)) {
      const contractData = contracts[contractKey];

      if (contractData.address) {
        // Extract contract name from path (e.g., "contracts/Repository.sol:Repository" -> "Repository")
        const contractName = contractData.contract ? contractData.contract.split(':')[1] : 'Unknown';

        // Ensure constructorArgs is an array
        let constructorArgs = contractData.arguments || [];
        if (!Array.isArray(constructorArgs)) {
          constructorArgs = [constructorArgs];
        }

        console.log(`Verifying ${contractName} at ${contractData.address}...`);

        try {
          // Run verification via CLI
          const output = await runVerify(contractData.address, contractData.contract, constructorArgs, networkName);
          const lowerOutput = output.toLowerCase();

          // Detect explorer type from output
          const isEtherscan = output.includes('etherscan.io') || output.includes('arbiscan') || output.includes('basescan') || output.includes('optimism.etherscan');
          const isBlockscout = output.includes('blockscout') || output.includes('explorer.lyra');
          const explorerName = isBlockscout ? 'Blockscout' : isEtherscan ? 'Etherscan' : 'Block Explorer';

          // Check for Hardhat error codes first
          if (output.includes('HHE80022') || (output.includes('HHE') && lowerOutput.includes('already verified'))) {
            // HHE80022 = contract already verified (this is actually a success case)
            console.log(`  ✓ ${explorerName}: Already verified`);
          } else if (output.includes('HHE80027')) {
            // Blockscout not configured - this is expected for Etherscan-only chains
            console.log(`  ○ Blockscout: Not configured (using Etherscan instead)`);
            // Try to extract Etherscan status from the output
            if (lowerOutput.includes('already') && lowerOutput.includes('verified')) {
              console.log(`  ✓ Etherscan: Already verified`);
            }
          } else if (output.includes('HHE')) {
            // Other Hardhat errors are actual failures
            const lines = output.split('\n').filter((line: string) => {
              const trimmed = line.trim();
              return trimmed &&
                     !trimmed.startsWith('===') &&
                     !trimmed.includes('Explorer:') &&
                     !trimmed.includes('📤') &&
                     !trimmed.includes('⏳');
            });
            const errorLine = lines.find(l => l.includes('HHE')) || lines[0] || 'Verification failed';
            console.log(`  ✗ ${explorerName}: ${errorLine.trim()}`);
          } else if (lowerOutput.includes('already') && lowerOutput.includes('verified')) {
            console.log(`  ✓ ${explorerName}: Already verified`);
          } else if (lowerOutput.includes('successfully') && (lowerOutput.includes('verified') || lowerOutput.includes('submitting'))) {
            console.log(`  ✓ ${explorerName}: Verified successfully`);
          } else if (lowerOutput.includes('submitting verification') || lowerOutput.includes('submitted for verification')) {
            console.log(`  ✓ ${explorerName}: Submitted for verification`);
          } else {
            // Log the output for debugging if we can't parse it
            console.log(`  ○ ${explorerName}: Verification attempted`);
            if (process.env.DEBUG_VERIFY) {
              console.log('Debug output:', output);
            }
          }
        } catch (error: any) {
          console.log(`  ✗ ${error.message || 'Verification failed'}`);
        }
      }
    }
  } catch (error) {
    console.error('Error reading or parsing the file:', error);
  }
};

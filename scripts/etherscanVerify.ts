import hre from 'hardhat';
import fs from 'fs';

export const etherscanVerification = (contractAddress: string, args: (string | string[])[]) => {
  if (hre.network.name === 'local') {
    return;
  }
  console.log('Attempting to verify contract:%s on etherscan',contractAddress);

  return runTaskWithRetry(
    'verify:verify',
    {
      address: contractAddress,
      constructorArguments: args,
    },
    1,
    10000,
  );
};

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry is needed because the contract was recently deployed and it hasn't propagated to the explorer backend yet
export const runTaskWithRetry = async (task: string, params: any, times: number, msDelay: number) => {
  let counter = times;
  await delay(msDelay);

  try {
    await hre.run(task, params);
  } catch (error: any) {
    if (error.message.includes('Reason: Already Verified')) {
      console.log('Exiting verification, already verified');
      return;
    }
    if (error instanceof Error) {
      console.error('[ETHERSCAN][ERROR]', 'unable to verify', error.message);

      if (error.message.includes('Reason: Already Verified')) {
        console.log('Exiting, already verified');
        return;
      }
      counter--;

      if (counter > 0) {
        console.log('Retrying...');
        await runTaskWithRetry(task, params, counter, msDelay);
      }
    }
  }
};

export const verifyContractsFromFile = async (filePath: string) => {
  try {
    const fileData = fs.readFileSync(filePath, 'utf-8');
    const contracts = JSON.parse(fileData);
    for (const contract of Object.keys(contracts)) {
      if (contracts[contract].address) {
        await etherscanVerification(contracts[contract].address, contracts[contract].arguments);
      } else {
        await etherscanVerification(contracts[contract],[]);
      }

    }
  } catch (error) {
    console.error('Error reading or parsing the file:', error);
  }
};

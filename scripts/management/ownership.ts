import { config } from 'dotenv';
import { transferOwnership } from '../management/transferOwnership';
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from 'hardhat';
// Load the environment variables from .env file
config();

async function main() {
  // Get the argument from the environment variable
  const newOwner = new ethers.Wallet(process.env.NEW_PRIVATE_KEY as string).connect(ethers.provider) as unknown as SignerWithAddress;
  
  // Call the transferOwnership function with the parsed argument
  await transferOwnership(newOwner);
}

main().then(() => process.exit(0)).catch(error => {
  console.log(error);
});

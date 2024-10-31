import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import chalk from "chalk";

export async function transferOwnership(newOwner: SignerWithAddress): Promise<void> {
  console.log(chalk.green(`Transferring ownership to ${newOwner.address}`));
  const filePath = path.resolve(__dirname, 'testSystem.json');
  const data = fs.readFileSync(filePath, 'utf-8');
  const jsonData = JSON.parse(data);


  // call nominateNewOwner on BookKeeper
  const bookkeeper = new ethers.Contract(jsonData.BookKeeper.address, jsonData.BookKeeper.abi, newOwner);
  console.log('Calling nominateNewOwner on BookKeeper...');
  await bookkeeper.nominateNewOwner(newOwner.address);
  
  // call nominateNewOwner on RepositoryFactory
  const repositoryFactory = new ethers.Contract(jsonData.RepositoryFactory.address, jsonData.RepositoryFactory.abi, newOwner);
  console.log('Calling nominateNewOwner on RepositoryFactory...');
  await repositoryFactory.nominateNewOwner(newOwner.address);

  // call nominateNewOwner on Repository
  const repository = new ethers.Contract(jsonData.Repositories[0].address, jsonData.Repositories[0].abi, newOwner);
  console.log('Calling nominateNewOwner on Repository...');
  await repository.nominateNewOwner(newOwner.address);
  
  console.log(`Ownership of all owned contracts transferred to ${newOwner.address}`);
}

export async function acceptOwnership(newOwner: SignerWithAddress): Promise<void> {
  console.log(chalk.green(`Accepting ownership for ${newOwner.address}`));
  const filePath = path.resolve(__dirname, 'testSystem.json');
  const data = fs.readFileSync(filePath, 'utf-8');
  const jsonData = JSON.parse(data);

  // call acceptOwnership on BookKeeper
  const bookkeeper = new ethers.Contract(jsonData.BookKeeper.address, jsonData.BookKeeper.abi, newOwner);
  console.log('Calling acceptOwnership on BookKeeper...');
  await bookkeeper.acceptOwnership();

  // call acceptOwnership on RepositoryFactory
  const repositoryFactory = new ethers.Contract(jsonData.RepositoryFactory.address, jsonData.RepositoryFactory.abi, newOwner);
  console.log('Calling acceptOwnership on RepositoryFactory...');
  await repositoryFactory.acceptOwnership();

  
  const repository = new ethers.Contract(jsonData.Repositories[0].address, jsonData.Repositories[0].abi, newOwner);
  console.log('Calling acceptOwnership on Repository...');
  await repository.acceptOwnership();

  console.log(`Ownership of all owned contracts accepted by ${newOwner.address}`);
}



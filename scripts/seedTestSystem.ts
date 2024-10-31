import { ethers } from "ethers";
import { testSystemContracts } from "./deployTestSystem";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { toBN, toBytes32 } from "./utils/web3utils";
import { hre } from "./utils/testSetup";
import chalk from "chalk";

export async function seedRepositoryWithMockUSDC(
  user: SignerWithAddress,
  testSystem: testSystemContracts,
  overrides?: any
): Promise<void> {
  await initialiseContracts(testSystem, overrides);

  // mint user 100k usdc
  const amount = ethers.parseUnits("50000", 6);
  await testSystem.MockUSDC.connect(testSystem.deployer).permitMint(
    testSystem.deployer,
    true
  );
  await testSystem.MockUSDC.connect(testSystem.deployer).permitMint(user, true);
  await testSystem.MockUSDC.connect(testSystem.deployer).mint(
    testSystem.deployer,
    amount
  );
  await testSystem.MockUSDC.connect(testSystem.deployer).mint(user, amount); // 50k
  await testSystem.MockUSDC.connect(testSystem.deployer).mint(user, amount); // another 50k
  await testSystem.MockUSDC.connect(user).approve(
    testSystem.repositoryContracts[0].repository.getAddress(),
    amount
  );

  // Deposit the mockUSDC tokens into the Repository contract
  await testSystem.repositoryContracts[0].repository
    .connect(user)
    .initiateDeposit(amount, toBN("1")); // minimum accepted amount of lp tokens is 1e^(-18)
  await testSystem.repositoryContracts[0].repository
    .connect(testSystem.repositoryContracts[0].controller)
    .processDeposits(1);
}

export async function seedRepositoryEmpty(
  user: SignerWithAddress,
  testSystem: testSystemContracts,
  overrides?: any
): Promise<void> {
  await initialiseContracts(testSystem, overrides);

  // mint alice 100k usdc
  const amount = ethers.parseUnits("100000", 6);
  await testSystem.MockUSDC.connect(testSystem.deployer).permitMint(
    testSystem.deployer,
    true
  );
  await testSystem.MockUSDC.connect(testSystem.deployer).mint(user, amount); // 100k
}

export async function initialiseContracts(
  testSystem: testSystemContracts,
  overrides?: any
): Promise<void> {
  // initialise the repository

  await testSystem.ethFeed.connect(testSystem.deployer).setDecimals(18);

  const latestBlock = await hre.ethers.provider.getBlock("latest");
  // setting the eth price feed
  await testSystem.ethFeed
    .connect(testSystem.deployer)
    .setLatestAnswer(toBN("2000"), latestBlock.timestamp);

  // setting the eth price feed
  await testSystem.USDCFeed.connect(testSystem.deployer).setLatestAnswer(
    ethers.parseUnits("1", 6),
    latestBlock.timestamp
  );


  // check for wallet override
  if (
    overrides &&
    (overrides.useAccountBookKeeper || overrides.useDirectInputBookKeeper || overrides.useSimpleBookKeeper)
  ) {

    await testSystem.repositoryContracts[0].bookKeeper.init(
      await testSystem.repositoryContracts[0].repository.getAddress()
    );

    await testSystem.repositoryContracts[0].bookKeeper
      .connect(testSystem.repositoryContracts[0].controller)
      .markValueOutsideRepositorySettled(true);
  } else {
    await testSystem.repositoryContracts[0].bookKeeper
      .connect(testSystem.deployer)
      .init(
        {
          feedname: toBytes32("USDC/USD"),
          feed: await testSystem.usdcFeedWrapper.getAddress(),
          priceInDecimals: toBN("1", 6),
          assetAddress: await testSystem.usdcFeedWrapper.getAddress(),
          decimals: 6,
        },
        await testSystem.repositoryContracts[0].repository.getAddress(),
        await testSystem.repositoryContracts[0].executor.getAddress()
      );
  }
}

// helper function to seed user with usdc for testing
export async function seedWithUSDC(user: SignerWithAddress): Promise<void> {
  const amount = ethers.parseUnits("100000", 6);
  await hre.f.SC.MockUSDC.connect(hre.f.SC.repositoryContracts[0].owner).mint(
    user,
    amount
  );
}

export async function approveAndDepositUSDC(
  user: SignerWithAddress,
  amount: BigNumberish
): Promise<void> {
  // approve the pool for increased amount and deposit
  const approvedAmount = await hre.f.SC.MockUSDC.allowance(
    await user.getAddress(),
    hre.f.SC.repositoryContracts[0].repository.getAddress()
  );

  await hre.f.SC.MockUSDC.connect(user).approve(
    hre.f.SC.repositoryContracts[0].repository.getAddress(),
    approvedAmount + amount
  );

  await hre.f.SC.repositoryContracts[0].repository
    .connect(user)
    .initiateDeposit(amount, 0);
}


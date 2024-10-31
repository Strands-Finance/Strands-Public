// This contract manages the fixture for local testing

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Contract } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types/runtime";
import { ethers } from "hardhat";
import { mineBlock, restoreSnapshot, takeSnapshot } from "./evm";
import { hre } from "./testSetup";
import { deployTestSystem, testSystemContracts } from "../deployTestSystem";
import {
  seedRepositoryEmpty,
  seedRepositoryWithMockUSDC,
} from "../seedTestSystem";
import chalk from "chalk";

export type Fixture = {
  SC: testSystemContracts;
  deploySnap: number;
  emptyFixtureSnap: number;
  seedSnap: number;
  deployer: SignerWithAddress;
  alice: SignerWithAddress;
  signers: SignerWithAddress[];
};

// annoying circular dependency to ensure compilation with node. Strange...
export type HardhatRuntimeEnvironmentWithFixture = HardhatRuntimeEnvironment & {
  f: Fixture;
  tracer: any;
};

// contains fixture functions and types for deploying/ seeding test system
// Meant to be used in the main "before" block
// to reduce unnecessary deploys/seeds across test scripts.
// NOTE: does not work for jumps to future snapshots
// For overrides can use standard deployTest/seedTest scripts.

// Example:
// (1) Run seedFixture() to test first describe block
// (2) Custom board is deployed, so deployFixture() called
//     seedTestSystem snap is erased
// (3) Run seedFixture()
//     re-run seedTestSystem since seed snap was deleted in #2
export async function deployFixture(overrides?: any) {
  if (!hre.f.deploySnap) {
    hre.f.signers = await ethers.getSigners();
    hre.f.deployer = hre.f.signers[0];
    hre.f.alice = hre.f.signers[6]; // alice should not be a permission(ed) user
    hre.f.SC = (await deployTestSystem(overrides)) as testSystemContracts;
  } else {
    await restoreSnapshot(hre.f.deploySnap);
    hre.f.deploySnap = await takeSnapshot();
  }
  hre.f.seedSnap = undefined as any;
}

// This is where the seeding for usdc and lyra test system should occur
export async function seedFixture(overrides?: any) {
  if (!hre.f.seedSnap) {
    console.log(chalk.green("seed snap has not been deployed"));
    await deployFixture(overrides);
    await seedRepositoryWithMockUSDC(hre.f.SC.userAccount, hre.f.SC, overrides);

    // account for mineBlock() delay after takeSnapshot() in "else"
    await mineBlock();
  } else {
    if (overrides && overrides.deployNew) {
      await deployFixture(overrides);
      await seedRepositoryWithMockUSDC(
        hre.f.SC.userAccount,
        hre.f.SC,
        overrides
      );

      // account for mineBlock() delay after takeSnapshot() in "else"
      await mineBlock();
    } else {
      await restoreSnapshot(hre.f.seedSnap);
    }
  }

  await resetAllSnaps();

  hre.f.seedSnap = await takeSnapshot();
}

export async function seedEmptyRepositoryFixture(overrides?: any) {
  // console.log(chalk.blue("seeding empty repository"));
  if (!hre.f.emptyFixtureSnap) {
    await deployFixture(overrides);
    await seedRepositoryEmpty(hre.f.alice, hre.f.SC, overrides);
    // account for mineBlock() delay after takeSnapshot() in "else"
    await mineBlock();
  } else {
    if (overrides && overrides.deployNew) {
      await deployFixture(overrides);
      await seedRepositoryEmpty(hre.f.alice, hre.f.SC, overrides);
      // account for mineBlock() delay after takeSnapshot() in "else"
      await mineBlock();
    } else {
      // console.log(chalk.blue("restoring snap"));
      await restoreSnapshot(hre.f.emptyFixtureSnap);
    }
  }
  await resetAllSnaps();
  hre.f.emptyFixtureSnap = await takeSnapshot();
}

async function resetAllSnaps() {
  hre.f.deploySnap = undefined as any;
  hre.f.emptyFixtureSnap = undefined as any;
  // not resetting the fixture accounts as you want consistent accounts to test with across all tests
}

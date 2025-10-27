import { hre, expect, loadFixture, createFixture, getAlice, getBob, approveAndDeposit } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import RepositoryABI from "../../artifacts/contracts/Repository.sol/Repository.json";
import { Interface } from "ethers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe(`Repository MoveFundsToExecutor`, function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  const deployContractsFixture = createFixture(
    'directInput',
    'none',
    'USDC',
    false,
    50000,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);
    alice = getAlice();
    bob = getBob();
  });

  describe("Fund Transfer Operations", () => {
    it("should enforce access control and handle valid transfers", async () => {
      const repo = hre.f.SC.repositoryContracts[0].repository;
      const executor = hre.f.SC.repositoryContracts[0].executor;
      const controller = hre.f.SC.repositoryContracts[0].controller;

      // Test access control
      await expect(repo.connect(bob).moveFundsToExecutor(toBN("100")))
        .to.be.revertedWithCustomError(repo, "NotExecutorOrController");

      // Test controller can transfer
      expect(await hre.f.SC.MockUSDC.balanceOf(executor.getAddress())).to.be.eq(0);
      await repo.connect(controller).moveFundsToExecutor(toBN("100", 6));
      expect(await hre.f.SC.MockUSDC.balanceOf(executor.getAddress())).to.be.eq(toBN("100", 6));

      // Test executor can transfer via execute
      const iface = new Interface(RepositoryABI["abi"]);
      const txData = iface.encodeFunctionData("moveFundsToExecutor", [toBN("100", 6)]);
      await executor.connect(hre.f.SC.deployer).execute(repo.getAddress(), 0, txData);
      expect(await hre.f.SC.MockUSDC.balanceOf(executor.getAddress())).to.be.eq(toBN("200", 6));
    });

    it("should validate available balance and handle settlement state", async () => {
      const repo = hre.f.SC.repositoryContracts[0].repository;
      const executor = hre.f.SC.repositoryContracts[0].executor;
      const controller = hre.f.SC.repositoryContracts[0].controller;
      const bookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper;

      // Test insufficient balance scenario
      const amount = toBN("100", 6);
      await approveAndDeposit(bob, amount);

      const balanceAfter = await hre.f.SC.MockUSDC.balanceOf(repo.getAddress());
      const pendingDeposits = await repo.totalQueuedDeposits();
      const availableBalance = balanceAfter - pendingDeposits;
      const transferAmount = availableBalance + toBN("1", 6);

      await expect(repo.connect(controller).moveFundsToExecutor(transferAmount))
        .to.be.revertedWithCustomError(repo, "InsufficientLocalBalanceToTransfer");

      // Test settlement state management
      await repo.connect(controller).moveFundsToExecutor(toBN("100", 6));
      expect(await bookKeeper.valueOffChainSettled()).to.be.eq(false);

      // Test that NAV and AUM revert when not settled
      await expect(repo.getNAV())
        .to.be.revertedWithCustomError(bookKeeper, "ValueOffChainNotSettled");
      await expect(repo.getAUM())
        .to.be.revertedWithCustomError(bookKeeper, "ValueOffChainNotSettled");

      // Test settlement restoration
      await bookKeeper.connect(controller).markValueOffChainSettled(true);
      expect(await bookKeeper.valueOffChainSettled()).to.be.eq(true);
    });
  });

});

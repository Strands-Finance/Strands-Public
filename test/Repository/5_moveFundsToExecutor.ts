import { seedFixture } from "../../scripts/utils/fixture";
import { hre } from "../../scripts/utils/testSetup";
import { toBN,fromBN } from "../../scripts/utils/web3utils";
import RepositoryABI from "../../artifacts/contracts/Repository.sol/Repository.json";
import { ethers, Interface } from "ethers";
const { expect } = require("chai");

describe("Repository MoveFundsToExecutor - Testing (using DirectInputBookKeeper)", function () {
  beforeEach(() =>
    seedFixture({
      deployNew: true,
      useDirectInputBookKeeper: true,
    })
  );

  describe("Check permissions", async () => {
    it("non controller cant call moveFundsToExecutor", async () => {
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.SC.userAccount)
          .moveFundsToExecutor(toBN("100"))
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "NotExecutorOrController"
      );
    });

    it("controller can call moveFundsToExecutor", async () => {
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].executor.getAddress()
        )
      ).to.be.eq(toBN("0"));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .moveFundsToExecutor(toBN("100", 6));
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].executor.getAddress()
        )
      ).to.be.eq(ethers.parseUnits("100", 6));
    });

    it("can NOT moveFundsToExecutor if balance - pendingDeposit < amount ", async () => {
      const balanceBefore=await hre.f.SC.MockUSDC.balanceOf(
        await hre.f.SC.repositoryContracts[0].repository.getAddress()
      )

      const amount = toBN("100",6);

      await hre.f.SC.MockUSDC.connect(hre.f.SC.userAccount).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateDeposit(amount, toBN("1"));

      // console.log("after initiateDeposit, repo balance=%s, pending=%s",fromBN(await hre.f.SC.MockUSDC.balanceOf(
      //   await hre.f.SC.repositoryContracts[0].repository.getAddress()
      // ),6)
      // ,fromBN(await hre.f.SC.repositoryContracts[0].repository.totalQueuedDeposits(),6))
      await expect(hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .moveFundsToExecutor(balanceBefore+toBN("1",6))).to.revertedWithCustomError(
          hre.f.SC.repositoryContracts[0].repository,"InsufficientLocalBalanceToTransfer");

    });

    it("controller can call markValueOutsideRepositorySettled", async () => {
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].executor.getAddress()
        )
      ).to.be.eq(toBN("0"));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .moveFundsToExecutor(toBN("100", 6));
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].executor.getAddress()
        )
      ).to.be.eq(ethers.parseUnits("100", 6));

      // Check moveFundsToExecutor set the valueOutsideRepositorySettled false
      // console.log(
      //   "Move Funds Settled=%s",
      //   await hre.f.SC.repositoryContracts[0].bookKeeper.valueOutsideRepositorySettled()
      // );
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.valueOutsideRepositorySettled()
      ).to.be.eq(false);

      // getNAV revert when valueOutsideRepositorySettled false
      await expect(
        hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].bookKeeper,
        "ValueOutsideRepositoryNotSettled"
      );

      // getAUM revert when valueOutsideRepositorySettled false
      await expect(
        hre.f.SC.repositoryContracts[0].repository.getAUM()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].bookKeeper,
        "ValueOutsideRepositoryNotSettled"
      );

      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOutsideRepositorySettled(true);
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.valueOutsideRepositorySettled()
      ).to.be.eq(true);
    });

    it("contract executor can call moveFundsToExecutor", async () => {
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].executor.getAddress()
        )
      ).to.be.eq(toBN("0"));
      const iface = new Interface(RepositoryABI["abi"]);
      const txData = iface.encodeFunctionData("moveFundsToExecutor", [
        toBN("100", 6),
      ]);
      await hre.f.SC.repositoryContracts[0].executor
        .connect(hre.f.SC.deployer)
        .execute(
          await hre.f.SC.repositoryContracts[0].repository.getAddress(),
          0,
          txData
        );
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].executor.getAddress()
        )
      ).to.be.eq(ethers.parseUnits("100", 6));
    });
  });

  describe("Check recipient", async () => {
    it("controller can call and transfer to executor", async () => {
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].executor.getAddress()
        )
      ).to.be.eq(toBN("0"));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .moveFundsToExecutor(toBN("100", 6));
      expect(
        await hre.f.SC.MockUSDC.balanceOf(
          await hre.f.SC.repositoryContracts[0].executor.getAddress()
        )
      ).to.be.eq(ethers.parseUnits("100", 6));
    });
  });
});

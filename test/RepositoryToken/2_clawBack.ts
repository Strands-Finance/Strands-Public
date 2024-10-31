import { seedFixture } from "../../scripts/utils/fixture";
import { expect, hre } from "../../scripts/utils/testSetup";

const { ethers } = require("hardhat");

describe("Repository Token - Testing (using Normal BookKeeper)", function () {
  beforeEach(() => seedFixture({}));

  describe("Repository Token - repository owner clawback", () => {
    it("Only repository owner can call the transferFrom", async () => {
      const amount = ethers.parseUnits("10000", 6);

      await hre.f.SC.MockUSDC.connect(hre.f.SC.userAccount).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateDeposit(amount, 0);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.SC.repositoryContracts[0].owner)
        .transferFrom(
          hre.f.SC.userAccount.address,
          hre.f.alice.address,
          amount
        );

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          hre.f.alice.address
        )
      ).to.be.eq(amount);
    });

    it("Non owner transfer from will work as normal transferFrom", async () => {
      const amount = ethers.parseUnits("10000", 6);

      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.repositoryContracts[0].controller)
          .transferFrom(
            hre.f.SC.userAccount.address,
            hre.f.alice.address,
            amount
          )
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "ERC20InsufficientAllowance"
      );
    });

    it("Non owner transfer from will work as normal transferFrom", async () => {
      const amount = ethers.parseUnits("10000", 6);

      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.repositoryContracts[0].controller)
          .transferFrom(
            hre.f.SC.userAccount.address,
            hre.f.alice.address,
            amount
          )
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "ERC20InsufficientAllowance"
      );
    });

    it("Non owner can NOT renonce OwnerTransability", async () => {
      const amount = ethers.parseUnits("10000", 6);

      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.repositoryContracts[0].controller)
          .renounceOwnerTransferability()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken, "OnlyRepositoryOwner"
      );
    });

    it("owner can not transfer after renounceOwnerTransferability", async () => {
      let ownerTransferable = await hre.f.SC.repositoryContracts[0].repositoryToken.ownerTransferable()
      await expect(ownerTransferable).to.be.true

      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.SC.repositoryContracts[0].owner)
        .renounceOwnerTransferability()

      ownerTransferable = await hre.f.SC.repositoryContracts[0].repositoryToken.ownerTransferable()
      await expect(ownerTransferable).to.be.false

      const amount = ethers.parseUnits("10000", 6);

      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.repositoryContracts[0].owner)
          .transferFrom(
            hre.f.SC.userAccount.address,
            hre.f.alice.address,
            amount
          )
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "ERC20InsufficientAllowance"
      );
    });

  });
});

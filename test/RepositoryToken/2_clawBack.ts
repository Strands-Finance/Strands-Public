import { expect, hre, ethers, loadFixture, createFixture, approveAndDeposit, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";

describe(`Repository Token - Testing (using accountNFTBookKeeper)`, function () {
  let alice: any;
  let bob: any;

  const deployContractsFixture = createFixture(
    'accountNFT',
    'none',
    'USDC',
    true,
    100000,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);

    alice = getAlice();
    bob = getBob();
  });

  describe("Repository Token - repository owner clawback", () => {
    it("Only repository owner can call the transferFrom", async () => {
      const amount = toBN("10000", 6);

      await approveAndDeposit(bob, amount, true, 'USDC');

      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.SC.repositoryContracts[0].owner)
        .transferFrom(
          bob.address,
          alice.address,
          amount
        );

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          alice.address
        )
      ).to.be.eq(amount);
    });

    it("Non owner transfer from will work as normal transferFrom", async () => {
      const amount = toBN("10000", 6);

      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.repositoryContracts[0].controller)
          .transferFrom(
            bob.address,
            alice.address,
            amount
          )
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "ERC20InsufficientAllowance"
      );
    });

    it("Non owner transfer from will work as normal transferFrom", async () => {
      const amount = toBN("10000", 6);

      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.repositoryContracts[0].controller)
          .transferFrom(
            bob.address,
            alice.address,
            amount
          )
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "ERC20InsufficientAllowance"
      );
    });

    it("Non owner can NOT renonce OwnerTransability", async () => {
      const amount = toBN("10000", 6);

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

      const amount = toBN("10000", 6);

      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.repositoryContracts[0].owner)
          .transferFrom(
            bob.address,
            alice.address,
            amount
          )
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "ERC20InsufficientAllowance"
      );
    });

  });
});

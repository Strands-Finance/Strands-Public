import { seedFixture } from "../../scripts/utils/fixture";
import { expect, hre } from "../../scripts/utils/testSetup";
import { toBN,fromBN } from "../../scripts/utils/web3utils";

describe("WhitelistGateKeeper - Testing", () => {
  beforeEach(() => seedFixture({ useDirectInputBookKeeper: true,useWhitelistGateKeeper: true }));

  describe("Whitelisting & Unwhitelisting(depositWhitelistEnabled = true)", () => {
    it("Non controller can't set the whitelisted users", async () => {
      await expect(
        hre.f.SC.gateKeeper
          .connect(hre.f.alice)
          .setUserCanDeposit([hre.f.alice.address])
      ).to.be.revertedWithCustomError(hre.f.SC.gateKeeper, "OnlyController");
    });

    it("Only controller can set the whitelisted users", async () => {
      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .setUserCanDeposit([hre.f.alice.address]);

      expect(
        await hre.f.SC.gateKeeper.canDeposit(hre.f.alice.address)
      ).to.be.eq(true);
    });

    it("alice should be able to deposit", async function () {
      const amount = ethers.parseUnits("100", 6);
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        await hre.f.alice.getAddress(), amount);
      await hre.f.SC.MockUSDC.connect(
        hre.f.alice
      ).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);

      // console.log("AUM=%s",fromBN(await hre.f.SC.repositoryContracts[0].repository.getAUM()))
      // console.log("repository balance=%s",fromBN(await(hre.f.SC.MockUSDC.balanceOf(
      //   await hre.f.SC.repositoryContracts[0].repository.getAddress())),6))
      // console.log("qDeposit=%s",fromBN(await hre.f.SC.repositoryContracts[0].repository.totalQueuedDeposits(),6))

      const tokenValue =
        await hre.f.SC.repositoryContracts[0].repository.getNAV();

      // console.log("tokenValue=%s",fromBN(tokenValue))
      expect(tokenValue).eq(toBN("1"));

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      const estimateValue = (toBN("100") / tokenValue) * toBN("1"); // loosing precision doing decimal division on the NAV and the scaled value.

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          hre.f.alice.address
        )
      ).to.be.closeTo(estimateValue, toBN("1"));
    });

    it("Non controller can't unset the whitelisted users", async () => {
      await expect(
        hre.f.SC.gateKeeper
          .connect(hre.f.alice)
          .unsetUserCanDeposit([hre.f.alice.address])
      ).to.be.revertedWithCustomError(hre.f.SC.gateKeeper, "OnlyController");
    });

    it("Only controller can unset the whitelisted users", async () => {
      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .unsetUserCanDeposit([hre.f.alice.address]);

      expect(
        await hre.f.SC.gateKeeper.canDeposit(hre.f.alice.address)
      ).to.be.eq(false);
    });

    it("alice should NOT be able to deposit", async function () {
      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .unsetUserCanDeposit([hre.f.alice.address]);

      const amount = ethers.parseUnits("100", 6);
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        await hre.f.alice.getAddress(), amount);
      await hre.f.SC.MockUSDC.connect(
        hre.f.alice
      ).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );
      await expect(hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice).initiateDeposit(amount, toBN("1"))).to.be.
        revertedWithCustomError(hre.f.SC.repositoryContracts[0].repository, "NotWhitelisted");
    });
  });

  describe("Whitelisting (depositWhitelistEnabled = false)", async () => {
    it("Always return canDeposit true", async () => {
      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .setDepositWhitelistEnabled(false);
      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .unsetUserCanDeposit([hre.f.alice.address]);
      expect(
        await hre.f.SC.gateKeeper.canDeposit(hre.f.alice.address)
      ).to.be.eq(true);
    });
  });

  describe("Repository Token Transfer", async () => {
    it("Non controller can't blacklist users for transferring Repository Token", async () => {
      await expect(
        hre.f.SC.gateKeeper
          .connect(hre.f.alice)
          .addToTransferBlacklist([hre.f.alice.address])
      ).to.be.revertedWithCustomError(hre.f.SC.gateKeeper, "OnlyController");
    });

    it("Only controller can blacklist users for transferring Repository Token", async () => {
      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .addToTransferBlacklist([hre.f.alice.address]);

      expect(
        await hre.f.SC.gateKeeper.canTransferRepositoryToken(
          hre.f.alice.address
        )
      ).to.be.eq(false);

      await expect(hre.f.SC.repositoryContracts[0].repositoryToken.connect(hre.f.alice).
        transfer(hre.f.signers[10].address, 1)).to.be.revertedWith("Blacklisted")
    });

    it("Repository can remove from queuedWithdrawal even if recipient is blacklisted", async () => {

      const amount6 = ethers.parseUnits("1000", 6);
      const amount18 = ethers.parseUnits("1000", 18);
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        await hre.f.alice.getAddress(), amount6);
      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),amount6);
      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.alice).initiateDeposit(amount6, 0);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(2);

      let aliceRepositoryTokenBalance=await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(hre.f.alice.address)
      expect(aliceRepositoryTokenBalance).to.be.closeTo(amount18,toBN("1"))

      await hre.f.SC.repositoryContracts[0].repository
      .connect(hre.f.SC.userAccount)
      .initiateWithdraw(amount18, 0);

      await hre.f.SC.repositoryContracts[0].repository
      .connect(hre.f.alice)
      .initiateWithdraw(amount18, 0);
     
      aliceRepositoryTokenBalance=await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(hre.f.alice.address)
 
      expect(aliceRepositoryTokenBalance).to.be.closeTo(0,toBN("1"))

      // check that the order is in the queue
      const nextQueuedWithdraw =
        await hre.f.SC.repositoryContracts[0].repository.withdrawQueue(0);
      expect(nextQueuedWithdraw[1]).to.be.eq(
        await hre.f.SC.userAccount.getAddress()
      );

      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .addToTransferBlacklist([hre.f.alice.address]);
      
      expect(
        await hre.f.SC.gateKeeper.canTransferRepositoryToken(
          hre.f.alice.address
        )
      ).to.be.eq(false);

      // cancel withdraw
      await hre.f.SC.repositoryContracts[0].repository
      .connect(hre.f.SC.repositoryContracts[0].controller)
      .removeWithdrawalFromQueue(1);

      await hre.f.SC.repositoryContracts[0].repository
      .connect(hre.f.SC.repositoryContracts[0].controller)
      .processWithdrawals(2);
    });

    it("Non controller can't unblacklist users for transferring Repository Token", async () => {
      await expect(
        hre.f.SC.gateKeeper
          .connect(hre.f.alice)
          .removeFromTransferBlacklist([hre.f.alice.address])
      ).to.be.revertedWithCustomError(hre.f.SC.gateKeeper, "OnlyController");
    });

    it("Only controller can unblacklist users for transferring Repository Token", async () => {
      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .removeFromTransferBlacklist([hre.f.alice.address]);

      expect(
        await hre.f.SC.gateKeeper.canTransferRepositoryToken(
          hre.f.alice.address
        )
      ).to.be.eq(true);
    });

    it("owner transfer", async function () {
      const amount = ethers.parseUnits("100", 6);
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        await hre.f.alice.getAddress(), amount);
      await hre.f.SC.MockUSDC.connect(
        hre.f.alice
      ).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);

      const tokenValue =
        await hre.f.SC.repositoryContracts[0].repository.getNAV();
      expect(tokenValue).eq(toBN("1"));

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      const estimateValue = (toBN("100") / tokenValue) * toBN("1"); // loosing precision doing decimal division on the NAV and the scaled value.

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          hre.f.alice.address
        )
      ).to.be.closeTo(estimateValue, toBN("1"));

      await hre.f.SC.repositoryContracts[0].repositoryToken.connect(hre.f.alice).
        transfer(hre.f.signers[10].address, 1)

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          hre.f.signers[10].address
        )
      ).to.eq(1);
    });
  });
});

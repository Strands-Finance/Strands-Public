import { expect, hre, ethers, loadFixture, createFixture, approveAndDeposit, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN,fromBN } from "../helpers/testUtils.js";
import type { Repository, RepositoryToken, TestERC20SetDecimals, WhitelistGateKeeper } from "../../typechain-types/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe(`whitelistGateKeeper - Testing (using directInputBookKeeper)`, () => {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  // Contract shortcuts for better readability
  let repo: Repository;
  let repoToken: RepositoryToken;
  let mockUSDC: TestERC20SetDecimals;
  let gateKeeper: WhitelistGateKeeper;
  let controller: HardhatEthersSigner;

  // Cached addresses to avoid repeated async calls
  let repoAddress: string;
  let aliceAddress: string;
  let bobAddress: string;

  const deployContractsFixture = createFixture(
    'directInput',
    'whitelist',
    'USDC',
    true,
    10000,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);

    // Initialize signers
    alice = getAlice();
    bob = getBob();

    // Set up contract shortcuts
    repo = hre.f.SC.repositoryContracts[0].repository;
    repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
    mockUSDC = hre.f.SC.MockUSDC;
    gateKeeper = hre.f.SC.gateKeeper;
    controller = hre.f.deployer;

    // Cache frequently used addresses
    [repoAddress, aliceAddress, bobAddress] = await Promise.all([
      repo.getAddress(),
      alice.getAddress(),
      bob.getAddress()
    ]);
  });

  describe("Whitelisting & Unwhitelisting(depositWhitelistEnabled = true)", () => {
    it("should revert when non-controller tries to set whitelisted users", async () => {
      await expect(
        gateKeeper.connect(alice).setUserCanDeposit([aliceAddress])
      ).to.be.revertedWithCustomError(gateKeeper, "OnlyController");
    });

    it("should allow controller to set whitelisted users", async () => {
      await gateKeeper.connect(controller).setUserCanDeposit([aliceAddress]);

      expect(await gateKeeper.canDeposit(aliceAddress)).to.be.eq(true);
    });

    it("should allow whitelisted user to deposit", async function () {
      const amount = toBN("100", 6);
      await approveAndDeposit(alice, amount, false, 'USDC');

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
          alice.address
        )
      ).to.be.closeTo(estimateValue, toBN("1"));
    });

    it("Non controller can't unset the whitelisted users", async () => {
      await expect(
        hre.f.SC.gateKeeper
          .connect(alice)
          .unsetUserCanDeposit([alice.address])
      ).to.be.revertedWithCustomError(hre.f.SC.gateKeeper, "OnlyController");
    });

    it("Only controller can unset the whitelisted users", async () => {
      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .unsetUserCanDeposit([alice.address]);

      expect(
        await hre.f.SC.gateKeeper.canDeposit(alice.address)
      ).to.be.eq(false);
    });

    it("alice should NOT be able to deposit", async function () {
      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .unsetUserCanDeposit([alice.address]);

      const amount = toBN("100", 6);
      await hre.f.SC.MockUSDC.connect(hre.f.SC.deployer).mint(
        await alice.getAddress(), amount);
      await hre.f.SC.MockUSDC.connect(
        alice
      ).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );
      await expect(hre.f.SC.repositoryContracts[0].repository
        .connect(alice).initiateDeposit(amount, toBN("1"))).to.be.
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
        .unsetUserCanDeposit([alice.address]);
      expect(
        await hre.f.SC.gateKeeper.canDeposit(alice.address)
      ).to.be.eq(true);
    });
  });

  describe("Repository Token Transfer", async () => {
    it("Non controller can't blacklist users for transferring Repository Token", async () => {
      await expect(
        hre.f.SC.gateKeeper
          .connect(alice)
          .addToTransferBlacklist([alice.address])
      ).to.be.revertedWithCustomError(hre.f.SC.gateKeeper, "OnlyController");
    });

    it("Only controller can blacklist users for transferring Repository Token", async () => {
      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .addToTransferBlacklist([alice.address]);

      expect(
        await hre.f.SC.gateKeeper.canTransferRepositoryToken(
          alice.address
        )
      ).to.be.eq(false);

      await expect(hre.f.SC.repositoryContracts[0].repositoryToken.connect(alice).
        transfer(hre.f.signers[10].address, 1)).to.be.revertedWith("Blacklisted")
    });

    it("Repository can remove from queuedWithdrawal even if recipient is blacklisted", async () => {

      const amount6 = toBN("1000", 6);
      const amount18 = toBN("1000");
      await approveAndDeposit(alice, amount6, true, 'USDC');

      let aliceRepositoryTokenBalance=await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(alice.address)
      expect(aliceRepositoryTokenBalance).to.be.closeTo(amount18,toBN("1"))

      await hre.f.SC.repositoryContracts[0].repository
      .connect(bob)
      .initiateWithdraw(amount18, 0);

      await hre.f.SC.repositoryContracts[0].repository
      .connect(alice)
      .initiateWithdraw(amount18, 0);
     
      aliceRepositoryTokenBalance=await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(alice.address)
 
      expect(aliceRepositoryTokenBalance).to.be.closeTo(0,toBN("1"))

      // check that the order is in the queue
      const nextQueuedWithdraw =
        await hre.f.SC.repositoryContracts[0].repository.withdrawQueue(0);
      expect(nextQueuedWithdraw[1]).to.be.eq(
        await bob.getAddress()
      );

      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .addToTransferBlacklist([alice.address]);
      
      expect(
        await hre.f.SC.gateKeeper.canTransferRepositoryToken(
          alice.address
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
          .connect(alice)
          .removeFromTransferBlacklist([alice.address])
      ).to.be.revertedWithCustomError(hre.f.SC.gateKeeper, "OnlyController");
    });

    it("Only controller can unblacklist users for transferring Repository Token", async () => {
      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .removeFromTransferBlacklist([alice.address]);

      expect(
        await hre.f.SC.gateKeeper.canTransferRepositoryToken(
          alice.address
        )
      ).to.be.eq(true);
    });

    it("owner transfer", async function () {
      const amount = toBN("100", 6);
      await approveAndDeposit(alice, amount, true, 'USDC');

      const tokenValue =
        await hre.f.SC.repositoryContracts[0].repository.getNAV();
      expect(tokenValue).eq(toBN("1"));

      const estimateValue = (toBN("100") / tokenValue) * toBN("1"); // loosing precision doing decimal division on the NAV and the scaled value.

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          alice.address
        )
      ).to.be.closeTo(estimateValue, toBN("1"));

      await hre.f.SC.repositoryContracts[0].repositoryToken.connect(alice).
        transfer(hre.f.signers[10].address, 1)

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          hre.f.signers[10].address
        )
      ).to.eq(1);
    });
  });
});

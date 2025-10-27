import { expect, hre, ethers, loadFixture, createFixture, approveAndDeposit, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";

describe(`nftGateKeeper - Testing (using directInputBookKeeper)`, () => {
  let alice: any;
  let bob: any;

  const deployContractsFixture = createFixture(
    'directInput',
    'nft',
    'USDC',
    true,
    0,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);

    alice = getAlice();
    bob = getBob();
  });

  describe("Whitelisting & Unwhitelisting(depositWhitelistEnabled = true)", () => {
    it("Non controller can NOT update NFT address", async () => {
      await expect(hre.f.SC.gateKeeper
        .connect(alice)
        .updateNftCollectionAddress(await hre.f.SC.strandsAccount.getAddress())
      ).to.be.revertedWithCustomError(hre.f.SC.gateKeeper, "OnlyController");
    });

    it("Only controller can update NFT address", async () => {
      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .updateNftCollectionAddress(await hre.f.SC.strandsAccount.getAddress());

      expect(
        await hre.f.SC.gateKeeper.canDeposit(alice.address)
      ).to.be.eq(false);
    });

    it("Can not update NFT address to 0x0", async () => {
      await expect(hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .updateNftCollectionAddress("0x0000000000000000000000000000000000000000")
      ).to.be.revertedWithCustomError(hre.f.SC.gateKeeper, "InvalidNFTAddress");
    });

    it("nft holder should be able to deposit", async function () {
      await hre.f.SC.strands250.adminSelfBatchMint(1);
      await hre.f.SC.strands250.connect(hre.f.deployer).transferFrom(
        hre.f.deployer.address,
        alice.address,
        1
      );

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
      ).to.be.eq(estimateValue);
    });

    it("alice should NOT be able to deposit", async function () {

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
      await hre.f.SC.strands250.adminSelfBatchMint(1);
      await hre.f.SC.strands250.connect(hre.f.deployer).transferFrom(
        hre.f.deployer.address,
        alice.address,
        1
      );

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
      ).to.be.eq(estimateValue);

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

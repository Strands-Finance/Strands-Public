import { deployFixture, seedFixture, seedEmptyRepositoryFixture } from "../../scripts/utils/fixture";
import { expect, hre } from "../../scripts/utils/testSetup";
import { toBN } from "../../scripts/utils/web3utils";

describe("NFTGateKeeper - Testing", () => {
  beforeEach(() => seedEmptyRepositoryFixture({ useNFTGateKeeper: true }));

  describe("Whitelisting & Unwhitelisting(depositWhitelistEnabled = true)", () => {
    it("Non controller can NOT update NFT address", async () => {
      await expect(hre.f.SC.gateKeeper
        .connect(hre.f.alice)
        .updateNftCollectionAddress(await hre.f.SC.strandsAccount.getAddress())
      ).to.be.revertedWithCustomError(hre.f.SC.gateKeeper, "OnlyController");
    });

    it("Only controller can update NFT address", async () => {
      await hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .updateNftCollectionAddress(await hre.f.SC.strandsAccount.getAddress());

      expect(
        await hre.f.SC.gateKeeper.canDeposit(hre.f.alice.address)
      ).to.be.eq(false);
    });

    it("Can not update NFT address to 0x0", async () => {
      await expect(hre.f.SC.gateKeeper
        .connect(hre.f.deployer)
        .updateNftCollectionAddress("0x0000000000000000000000000000000000000000")
      ).to.be.revertedWith("Invalid NFT address");
    });

    it("nft holder should be able to deposit", async function () {
      await hre.f.SC.strands250.adminSelfBatchMint(1);
      await hre.f.SC.strands250.connect(hre.f.deployer).transferFrom(
        hre.f.deployer.address,
        hre.f.alice.address,
        1
      );

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
      ).to.be.eq(estimateValue);
    });

    it("alice should NOT be able to deposit", async function () {

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
      await hre.f.SC.strands250.adminSelfBatchMint(1);
      await hre.f.SC.strands250.connect(hre.f.deployer).transferFrom(
        hre.f.deployer.address,
        hre.f.alice.address,
        1
      );

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
      ).to.be.eq(estimateValue);

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

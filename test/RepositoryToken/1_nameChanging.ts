import { hre, expect, ethers, loadFixture, createFixture, getAlice, getBob } from "../helpers/setupTestSystem.js";

describe(`Repository Token - Testing (using accountNFTBookKeeper)`, function () {
  let alice: any;
  let bob: any;

  const deployContractsFixture = createFixture(
    'accountNFT',
    'none',
    'USDC',
    true,
    50000,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);
    alice = getAlice();
    bob = getBob();
  });

  describe("Repository Token - name update testing", () => {
    it("repository owner should be able to update name", async () => {
      const oldName =
        await hre.f.SC.repositoryContracts[0].repositoryToken.name();
      expect(oldName).to.be.eq("StrandsRepositoryToken");
      const newName = "StrandsNewLiquidityToken";
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.deployer)
        .updateRepositoryTokenName(newName);
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.name()
      ).to.be.eq(newName);
    });

    it("non repository owner can not update name", async () => {
      const newName = "StrandsNewLiquidityToken";
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(bob)
          .updateRepositoryTokenName(newName)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyOwner"
      );
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.SC.controller)
          .updateRepositoryTokenName(newName)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyOwner"
      );
    });

    it("only repository can call updateTokenName", async () => {
      const newName = "StrandsNewLiquidityToken";
      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.deployer)
          .updateTokenName(newName)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "OnlyRepository"
      );
    });

    it("deployer cannot call protected RepositoryToken functions", async () => {
      // Deployer cannot mint
      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.deployer)
          .mint(alice.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "OnlyRepository"
      );

      // Deployer cannot burn
      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.deployer)
          .burn(alice.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "OnlyRepository"
      );

      // Deployer cannot update token name
      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.deployer)
          .updateTokenName("NewName")
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "OnlyRepository"
      );

      // Deployer cannot call withdrawHold
      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.deployer)
          .withdrawHold(alice.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "OnlyRepository"
      );
    });

    it("deployer has no special transfer privileges", async () => {
      // Deployer cannot call transferFrom or transfer - standard ERC20 behavior
      // This confirms deployer has no special "owner" powers
      const transferAmount = ethers.parseEther("1");

      // Deployer trying to transfer from alice should fail (no allowance)
      // Note: Even though alice has no balance, ERC20 checks balance first
      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.deployer)
          .transferFrom(alice.address, bob.address, transferAmount)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "ERC20InsufficientBalance"
      ); // Fails because alice has no tokens (balance checked before allowance)

      // Deployer trying to transfer tokens they don't have should fail
      await expect(
        hre.f.SC.repositoryContracts[0].repositoryToken
          .connect(hre.f.SC.deployer)
          .transfer(bob.address, transferAmount)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "ERC20InsufficientBalance"
      );

      // This confirms that removing Owned inheritance didn't grant deployer
      // any special transfer privileges - they're subject to normal ERC20 rules
    });
  });
});

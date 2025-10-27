import { hre, expect, ethers, loadFixture, createFixture, getAlice, getBob } from "../helpers/setupTestSystem.js";

describe(`StrandsOwned - Testing (using accountNFTBookKeeper)`, function () {
  let alice: any;
  let bob: any;

  const deployContractsFixture = createFixture(
    'accountNFT',
    'none',
    'API',
    true,
    0,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);


    alice = getAlice();
    bob = getBob();
  });

  describe("base line testing", () => {
    it("Should set the right owner", async function () {
      expect(await hre.f.SC.repositoryContracts[0].repository.owner()).to.equal(
        await hre.f.deployer.getAddress()
      );
    });

    it("Should nominate a new owner", async function () {
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.deployer)
        .nominateNewOwner(await alice.getAddress());
      expect(
        await hre.f.SC.repositoryContracts[0].repository.nominatedOwner()
      ).to.equal(await alice.getAddress());
    });

    it("Should accept ownership", async function () {
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.deployer)
        .nominateNewOwner(await alice.getAddress());
      await hre.f.SC.repositoryContracts[0].repository
        .connect(alice)
        .acceptOwnership();
      expect(await hre.f.SC.repositoryContracts[0].repository.owner()).to.equal(
        await alice.getAddress()
      );
    });
  });
});

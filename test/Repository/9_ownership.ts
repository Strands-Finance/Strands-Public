import { expect } from "chai";
import { hre } from "../../scripts/utils/testSetup";
import { seedFixture } from "../../scripts/utils/fixture";

describe("StrandsOwned - Testing (using BookKeeper)", function () {
  beforeEach(() => seedFixture({}));

  describe("base line testing", () => {
    it("Should set the right owner", async function () {
      expect(await hre.f.SC.repositoryContracts[0].repository.owner()).to.equal(
        await hre.f.deployer.getAddress()
      );
    });

    it("Should nominate a new owner", async function () {
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.deployer)
        .nominateNewOwner(await hre.f.alice.getAddress());
      expect(
        await hre.f.SC.repositoryContracts[0].repository.nominatedOwner()
      ).to.equal(await hre.f.alice.getAddress());
    });

    it("Should accept ownership", async function () {
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.deployer)
        .nominateNewOwner(await hre.f.alice.getAddress());
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .acceptOwnership();
      expect(await hre.f.SC.repositoryContracts[0].repository.owner()).to.equal(
        await hre.f.alice.getAddress()
      );
    });
  });
});

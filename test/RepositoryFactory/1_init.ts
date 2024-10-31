import { seedFixture } from "../../scripts/utils/fixture";
import { hre } from "../../scripts/utils/testSetup";

const { expect } = require("chai");

describe("Repository Factory - Testing (using BookKeeper)", () => {
  beforeEach(() => seedFixture({}));

  describe("Factory Repository - Fixture test", () => {
    it("should create a new Repository contract", async () => {
      expect(hre.f.SC.repositoryFactory).to.not.be.undefined;
      expect(hre.f.SC.repositoryContracts).to.not.be.undefined;
      expect(hre.f.SC.repositoryContracts[0].repository).to.not.be.undefined;

      const repository =
        await hre.f.SC.repositoryFactory.deployedRepositories(0);
      expect(repository).to.be.eq(
        await hre.f.SC.repositoryContracts[0].repository.getAddress()
      );
      const bookKeeper = await hre.f.SC.repositoryContracts[0].repository.bookKeeper();
      expect(bookKeeper).to.be.eq(
        await hre.f.SC.repositoryContracts[0].bookKeeper.getAddress()
      );
    });
  });
});

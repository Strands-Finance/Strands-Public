import { hre, expect, ethers, loadFixture, createFixture } from "../helpers/setupTestSystem.js";

describe(`Repository Factory - Testing (using accountNFTBookKeeper)`, () => {
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
  });

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

  describe("Repository Factory - Array Manipulation Tests", () => {
    it("should correctly track repository count", async () => {
      const initialCount = await hre.f.SC.repositoryFactory.repositoryCount();
      expect(initialCount).to.be.gt(0);
    });

    it("should verify repository tracking", async () => {
      const factory = hre.f.SC.repositoryFactory;
      const count = await factory.repositoryCount();

      // Verify we can access all repositories
      for (let i = 0; i < Number(count); i++) {
        const repo = await factory.deployedRepositories(i);
        expect(repo).to.not.equal("0x0000000000000000000000000000000000000000");
      }
    });
  });
});

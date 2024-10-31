import { seedFixture } from "../../scripts/utils/fixture";
import { hre } from "../../scripts/utils/testSetup";

const { expect } = require("chai");

describe("Repository Token - Testing (using Normal BookKeeper)", function () {
  beforeEach(() => seedFixture({}));

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
          .connect(hre.f.SC.userAccount)
          .updateRepositoryTokenName(newName)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
        "OnlyOwner"
      );
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.SC.controller)
          .updateRepositoryTokenName(newName)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repositoryToken,
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
  });
});

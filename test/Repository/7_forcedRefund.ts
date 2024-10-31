import { seedFixture } from "../../scripts/utils/fixture";
import { hre } from "../../scripts/utils/testSetup";
import { fromBN, toBN } from "../../scripts/utils/web3utils";

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Repository ForceRefund - Testing (using DirectInputBookKeeper)", function () {
  beforeEach(() =>
    seedFixture({
      useDirectInputBookKeeper: true,
    })
  );

  it("base line test", async () => {
    // check if user account has totalSupply of repository token
    const totalSupply =
      await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply();
    expect(
      await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
        await hre.f.SC.userAccount.getAddress()
      )
    ).to.be.eq(totalSupply);

    await hre.f.SC.repositoryContracts[0].repositoryToken
      .connect(hre.f.SC.userAccount)
      .approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        totalSupply
      );

    // // call force refund
    await hre.f.SC.repositoryContracts[0].repository
      .connect(hre.f.SC.repositoryContracts[0].controller)
      .initiateWithdrawAllFor([await hre.f.SC.userAccount.getAddress()]);

    await hre.f.SC.repositoryContracts[0].repository
      .connect(hre.f.SC.repositoryContracts[0].controller)
      .processWithdrawals(10);


    await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).reedemClaimableDelegated([await hre.f.SC.userAccount.getAddress()]);

    expect(
      await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].repository.getAddress()
      )
    ).to.be.eq(0);

    expect(
      await hre.f.SC.MockUSDC.balanceOf(await hre.f.SC.userAccount.getAddress())
    ).to.be.closeTo(ethers.parseUnits("100000", 6), toBN("1", 6));
    expect(
      await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
        await hre.f.SC.userAccount.getAddress()
      )
    ).to.be.eq(0);
  });
});

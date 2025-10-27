import { hre, expect, ethers, loadFixture, createFixture, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { fromBN, toBN } from "../helpers/testUtils.js";

describe(`Repository ForceRefund - Testing (using directInputBookKeeper)`, function () {
  let alice: any;
  let bob: any;

  const deployContractsFixture = createFixture(
    'directInput',
    'none',
    'USDC',
    true,
    100000,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);
    alice = getAlice();
    bob = getBob();
  });

  it("base line test", async () => {
    // expect(bob)
    // check if user account has totalSupply of repository token
    const totalSupply =
      await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply();
    expect(
      await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
        await bob.getAddress()
      )
    ).to.be.eq(totalSupply);

    await hre.f.SC.repositoryContracts[0].repositoryToken
      .connect(bob)
      .approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        totalSupply
      );

    // // call force refund
    await hre.f.SC.repositoryContracts[0].repository
      .connect(hre.f.SC.repositoryContracts[0].controller)
      .initiateWithdrawAllFor([await bob.getAddress()]);

    await hre.f.SC.repositoryContracts[0].repository
      .connect(hre.f.SC.repositoryContracts[0].controller)
      .processWithdrawals(10);


    await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).redeemClaimableDelegated([await bob.getAddress()]);

    expect(
      await hre.f.SC.MockUSDC.balanceOf(
        hre.f.SC.repositoryContracts[0].repository.getAddress()
      )
    ).to.be.eq(0);

    expect(
      await hre.f.SC.MockUSDC.balanceOf(await bob.getAddress())
    ).to.be.closeTo(toBN("100000", 6), toBN("1", 6));
    expect(
      await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
        await bob.getAddress()
      )
    ).to.be.eq(0);
  });
});

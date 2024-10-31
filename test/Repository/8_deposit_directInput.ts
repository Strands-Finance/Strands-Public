const { ethers } = require("hardhat");
import { expect } from "chai";
import { seedEmptyRepositoryFixture } from "../../scripts/utils/fixture";
import { hre } from "../../scripts/utils/testSetup";
import { fromBN, toBN } from "../../scripts/utils/web3utils";
import {seedWithUSDC} from "../../scripts/seedTestSystem";

describe("Repository Deposit - Testing (using DirectInputBookKeeper) with USDC as depositAsset", function () {
  beforeEach(async () => {
    await seedEmptyRepositoryFixture({
      deployNew: true,
      useDirectInputBookKeeper: true,
      useWalletExecutor: true,
    });
  });

  describe("depositing depositAsset to contract", function () {
    it("should revert if amount is zero", async function () {
      await expect(
        hre.f.SC.repositoryContracts[0].repository.initiateDeposit(0, 0)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "InvalidAmount"
      );
    });

    it("should transfer mockUSDC from msg.sender to the contract", async function () {
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).equal(ethers.parseUnits("100000", 6));
      // initiate deposit
      const amount = ethers.parseUnits("100", 6);

      // // approve the repository to manage usdc on your behalf
      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        await hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);
    });

    it("should mint repository tokens to the msg.sender", async function () {
      expect(
        await hre.f.SC.MockUSDC.balanceOf(await hre.f.alice.getAddress())
      ).equal(ethers.parseUnits("100000", 6));

      // initiate deposit
      const amount = ethers.parseUnits("1000", 6);

      // // approve the repository to manage usdc on your behalf
      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        await hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(amount, 0);

      // process deposit
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.closeTo(ethers.parseUnits("1000", 18), toBN("1"));
    });

    it("correctly calculate the amount of tokens that the user should receive", async function () {
      const [usdcAmount, amount] = [100e6, toBN("100")];

      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        usdcAmount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice)
        .initiateDeposit(usdcAmount, toBN("1"));

      const nav = await hre.f.SC.repositoryContracts[0].repository.getNAV();
      const estimateValue = (amount / nav) * toBN("1"); // 1e18 is being cancelled out

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.closeTo(estimateValue, toBN("1"));
    });

    it("correctly calculate amount of Repository Token when there are multiple actors", async () => {
      const [usdcAmount, amount] = [100e6, toBN("100")];

      const alice = hre.f.alice;
      const bob = hre.f.signers[10];

      // seed bob with usdc
      await seedWithUSDC(bob);

      // check that NAV is equal to 1e18
      await expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.closeTo(toBN("1"), toBN("1"));

      await hre.f.SC.MockUSDC.connect(alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        usdcAmount
      );
      await hre.f.SC.MockUSDC.connect(bob).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        usdcAmount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(alice)
        .initiateDeposit(usdcAmount, toBN("1"));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(bob)
        .initiateDeposit(usdcAmount, toBN("1"));

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(2);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await alice.getAddress()
        )
      ).to.be.closeTo(amount, toBN("1"));
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await bob.getAddress()
        )
      ).to.be.closeTo(amount, toBN("1"));
    });

    it("correctly calculate amount of Repository Token after valueOutsideRepository update", async () => {
      const [usdcAmount, amount] = [100e6, toBN("100")];

      const alice = hre.f.alice;
      const bob = hre.f.signers[10];

      // seed bob with usdc
      await seedWithUSDC(bob);

      // check that NAV is equal to 1e18
      await expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.closeTo(toBN("1"), toBN("1"));

      await hre.f.SC.MockUSDC.connect(alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        usdcAmount
      );
      await hre.f.SC.MockUSDC.connect(bob).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        usdcAmount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(alice)
        .initiateDeposit(usdcAmount, toBN("1"));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(bob)
        .initiateDeposit(usdcAmount, toBN("1"));

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(2);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await alice.getAddress()
        )
      ).to.be.closeTo(amount, toBN("1"));
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await bob.getAddress()
        )
      ).to.be.closeTo(amount, toBN("1"));

      // should be 200 tokens with a NAV of 1
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply()
      ).to.be.closeTo(toBN("200"), toBN("1"));
      // checking NAV
      const nav = await hre.f.SC.repositoryContracts[0].repository.getNAV();
      expect(nav).to.be.eq(toBN("1"));

      // update valueOutsideRepository
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOutsideRepository18(toBN("200"), 1000, nav * 2n);

      // check NAV
      expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.closeTo(toBN("2"), toBN("0.1"));
    });

    it("Double value of the pool and see that the correct number of tokens are minted", async function () {
      const [usdcAmount, amount] = [100e6, toBN("100")];

      const alice = hre.f.alice;
      const bob = hre.f.signers[10];

      // seed bob with usdc
      await seedWithUSDC(bob);

      // check that NAV is equal to 1e18
      await expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.closeTo(toBN("1"), toBN("1"));

      await hre.f.SC.MockUSDC.connect(alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        usdcAmount
      );
      await hre.f.SC.MockUSDC.connect(bob).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        usdcAmount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(alice)
        .initiateDeposit(usdcAmount, toBN("1"));

      // checking NAV
      const nav = await hre.f.SC.repositoryContracts[0].repository.getNAV();
      expect(nav).to.be.closeTo(toBN("1"), toBN("1"));

      // process alice's deposit
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await alice.getAddress()
        )
      ).to.be.closeTo(amount, toBN("1"));

      // update ValueOutsideRepository
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOutsideRepository18(toBN("100"), 1000, nav * 2n);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(bob)
        .initiateDeposit(usdcAmount, toBN("1"));

      // check NAV
      expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.closeTo(toBN("2"), toBN("0.1"));

      // process bob's deposit
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await bob.getAddress()
        )
      ).to.be.closeTo(toBN("50"), toBN("1"));
      // should be 150 tokens
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply()
      ).to.be.closeTo(toBN("150"), toBN("1"));
    });
  });

  describe("depositing ETH", function () {
    it("shouldnt be able to deposit ETH", async function () {
      // let [aum18,ts] = await hre.f.SC.repositoryContracts[0].repository.getLastKnownAUM()
      // console.log("aum18=",fromBN(aum18))
      // console.log("totalValueCap=",fromBN(await hre.f.SC.repositoryContracts[0].repository.totalValueCap18()))

      await expect(
        hre.f.SC.repositoryContracts[0].repository.connect(hre.f.alice).initiateDepositEth(0, {
          value: toBN('1',6)
        })
      ).to.be.revertedWithCustomError(hre.f.SC.repositoryContracts[0].repository, "CannnotDepositAssetType");
    });
  });
});

describe("Repository Deposit - Testing (using DirectInputBookKeeper) with WETH as depositAsset", function () {
  beforeEach(async () => {
    await seedEmptyRepositoryFixture({
      deployNew: true,
      useDirectInputBookKeeper: true,
      useWalletExecutor: true,
      wethAsDepositAsset: true,
    });
  });

  describe("depositing eth to contract", function () {
    it("should be able to deposit ETH", async function () {
      const alice = await hre.f.alice
      const amount = toBN("1");


      await hre.f.SC.repositoryContracts[0].repository.connect(alice).initiateDepositEth(toBN('1'), { value: amount });


      expect(
        await hre.f.SC.MockWETH.balanceOf(await hre.f.SC.repositoryContracts[0].repository.getAddress())
      ).equal(amount);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await alice.getAddress()
        )
      ).to.be.closeTo(amount, amount);
    });
  });
});


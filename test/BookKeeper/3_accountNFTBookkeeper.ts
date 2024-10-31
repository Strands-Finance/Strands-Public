const { ethers } = require("hardhat");
import { expect } from "chai";
import { seedEmptyRepositoryFixture} from "../../scripts/utils/fixture";
import { hre } from "../../scripts/utils/testSetup";
import { toBN,fromBN } from "../../scripts/utils/web3utils";
import {approveAndDepositUSDC,seedWithUSDC} from "../../scripts/seedTestSystem";
import {
  currentTime,
  fastForward,
  restoreSnapshot,
  takeSnapshot,
} from "../../scripts/utils/evm";
import { parseUnits } from "ethers";

describe("Repository Deposit - Testing (using AccountNFTBookKeeper)", function () {
  beforeEach(async () => {
    await seedEmptyRepositoryFixture({
      deployNew: true,
      useAccountBookKeeper: true,
      useWalletExecutor: true,
    });
    await hre.f.SC.strandsAccount
      .connect(hre.f.deployer)
      .mint(
        hre.f.alice.address,
        "firm1",
        "account number 1",
        ethers.parseEther("0"),
        ethers.parseEther("2"),
        ethers.parseEther("2"),
        ethers.parseEther("2"),
        (await currentTime())
      );
    await hre.f.SC.repositoryContracts[0].bookKeeper.setAccountNFT(
      await hre.f.SC.strandsAccount.getAddress(),
      1
    );
    // Mark valueOutsideRepositorySettled as true cause
    // it automatically set as false when setting a account nft
    await hre.f.SC.repositoryContracts[0].bookKeeper
      .connect(hre.f.SC.repositoryContracts[0].controller)
      .markValueOutsideRepositorySettled(true);
  });

  describe("depositing to contract", function () {
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

      const amount=1000
      await approveAndDepositUSDC(hre.f.alice, toBN(amount,6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.closeTo(toBN("1000"), toBN("1"));
    });

    it("correctly calculate the amount of tokens that the user should receive", async function () {
      const amount = 100;
      await approveAndDepositUSDC(hre.f.alice, toBN(amount,6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      const nav = await hre.f.SC.repositoryContracts[0].repository.getNAV();
      const estimateValue = toBN(amount / fromBN(nav)); // 1e18 is being cancelled out

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await hre.f.alice.getAddress()
        )
      ).to.be.closeTo(estimateValue, toBN("1"));
    });

    it("correctly calculate amount of Repository Token when there are multiple actors", async () => {

      const alice = hre.f.alice;
      const bob = hre.f.signers[10];

      // seed bob with usdc
      await seedWithUSDC(bob);

      // check that NAV is equal to 1e18
      await expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.closeTo(toBN("1"), toBN("1"));
      
      const amount = 100
      await approveAndDepositUSDC(hre.f.alice, toBN(amount,6));
      await approveAndDepositUSDC(bob, toBN(amount,6));
      await hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.SC.repositoryContracts[0].controller)
          .processDeposits(2);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await alice.getAddress()
        )
      ).to.be.closeTo(toBN(amount), toBN("1"));

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await bob.getAddress()
        )
      ).to.be.closeTo(toBN(amount), toBN("1"));
    });

    it("correctly calculate amount of Repository Tokens after valueOutsideRepository update", async () => {

      const alice = hre.f.alice;
      const bob = hre.f.signers[10];

      // seed bob with usdc
      await seedWithUSDC(bob);

      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          ethers.parseEther("0"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          (await currentTime())
        );

      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOutsideRepository18(100, toBN("1"));
      // check that NAV is equal to 1e18
      await expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.closeTo(toBN("1"), toBN("1"));

      const amount=100
      await approveAndDepositUSDC(hre.f.alice, toBN(amount,6));
      await approveAndDepositUSDC(bob, toBN(amount,6));

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(2);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await alice.getAddress()
        )
      ).to.be.closeTo(toBN(amount), toBN("1"));
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await bob.getAddress()
        )
      ).to.be.closeTo(toBN(amount), toBN("1"));

      // should be 200 tokens with a NAV of 1
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply()
      ).to.be.closeTo(toBN(2*amount), toBN("1"));

      // checking NAV
      const nav = await hre.f.SC.repositoryContracts[0].repository.getNAV();
      expect(nav).to.be.eq(toBN("1"));

      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          toBN("200"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          (await currentTime())
        );
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOutsideRepository18(100, toBN("2"));
      // update valueOutsideRepository
      // check NAV
      expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.closeTo(toBN("2"), toBN("0.1"));
    });

    it("Double value of the pool and see that the correct number of tokens are minted", async function () {

      const alice = hre.f.alice;
      const bob = hre.f.signers[10];

      // seed bob with usdc
      await seedWithUSDC(bob);

      // check that NAV is equal to 1e18
      await expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.closeTo(toBN("1"), toBN("1"));

      const amount=100
      await approveAndDepositUSDC(hre.f.alice, toBN(amount,6));

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // checking NAV
      const nav = await hre.f.SC.repositoryContracts[0].repository.getNAV();
      expect(nav).to.be.closeTo(toBN("1"), toBN("1"));

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await alice.getAddress()
        )
      ).to.be.closeTo(toBN(amount), toBN("1"));

      const newOutside=100
      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          toBN(newOutside),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          (await currentTime())
        );
      await approveAndDepositUSDC(bob, toBN(amount,6));

      const NAV=(amount+newOutside)/amount

      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOutsideRepository18(200, toBN(NAV));
      // check NAV
      expect(
        await hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.closeTo(toBN(NAV), toBN("0.1"));

      // process bob's deposit
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          await bob.getAddress()
        )
      ).to.be.closeTo(toBN(amount/NAV), toBN("1"));
      // should be 150 tokens
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply()
      ).to.be.closeTo(toBN(amount+amount/NAV), toBN("1"));
    });
  });

  let snapshotId;
  describe("AccountStatementStale", function () {
    it("Should fail valueOutsideRepositorySettled false", async () => {
      snapshotId = await takeSnapshot();
      fastForward(24 * 3600);
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOutsideRepositorySettled(false);

      const accountTokenId =
        await hre.f.SC.repositoryContracts[0].bookKeeper.accountTokenId();
      const accountDetails = await hre.f.SC.strandsAccount.getAccountDetails(
        accountTokenId
      );
      // console.log("curTimestamp=%s validPerid=%s validTimestamp=%s",currentTimestamp,validPeriod,validTimestamp)
      const settled =
        await hre.f.SC.repositoryContracts[0].bookKeeper.valueOutsideRepositorySettled();
      expect(settled).to.be.false;

      await expect(
        hre.f.SC.repositoryContracts[0].bookKeeper.getNAV()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].bookKeeper,
        "ValueOutsideRepositoryNotSettled"
      );

      await expect(
        hre.f.SC.repositoryContracts[0].bookKeeper.getAUM()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].bookKeeper,
        "ValueOutsideRepositoryNotSettled"
      );
    });

    it("Should fail when balance update timestamp is older than validPeriod and valueOutsideRepositorySettled true", async () => {
      fastForward(24 * 3600);

      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOutsideRepository18(200, toBN("1"));

      const settled =
        await hre.f.SC.repositoryContracts[0].bookKeeper.valueOutsideRepositorySettled();
      expect(settled).to.be.true;
      await expect(
        hre.f.SC.repositoryContracts[0].bookKeeper.getAUM()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].bookKeeper,
        "MarkedValueStale"
      );
    });

    it("Should pass when balance update timestamp is within validPeriod and valueOutsideRepositorySettled true", async () => {
      const accountNFTBalance=toBN("100")
      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          accountNFTBalance,
          toBN("0"),
          toBN("0"),
          toBN("0"),
          await currentTime()
        );

      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOutsideRepository18(100, toBN("1"));

      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOutsideRepositorySettled(true);

      const accountTokenId =
        await hre.f.SC.repositoryContracts[0].bookKeeper.accountTokenId();
      const accountDetails = await hre.f.SC.strandsAccount.getAccountDetails(
        accountTokenId
      );

      const settled =
        await hre.f.SC.repositoryContracts[0].bookKeeper.valueOutsideRepositorySettled();
      expect(settled).to.be.true;

      const nav = await hre.f.SC.repositoryContracts[0].bookKeeper.getNAV();
      expect(nav).to.be.eq(parseUnits("1"));

      await restoreSnapshot(snapshotId);
    });
  });

  describe("NAV and AUM", () => {
    it(`getNAV should revert due to stale time and getLastKnownNAV should return lastKnownNAV18`, async () => {
      const amount = 100;
      await approveAndDepositUSDC(hre.f.alice, toBN(amount,6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      const newOutside = 500;
      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          toBN(newOutside),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          (await currentTime())
        );

      const NAV=(amount+newOutside)/amount
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOutsideRepository18(10, toBN(NAV));
      await fastForward(20);

      // getNAV revert due to stale time
      await expect(
        hre.f.SC.repositoryContracts[0].repository.getNAV()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].bookKeeper,
        "MarkedValueStale"
      );

      const [lastNAV] =
        await hre.f.SC.repositoryContracts[0].repository.getLastKnownNAV();
      expect(lastNAV).to.be.eq(toBN(NAV));
    });

    it(`getAUM should revert due to stale time and getLastKnownAUM should return lastKnownAUM`, async () => {
      const amount = 100;
      await approveAndDepositUSDC(hre.f.alice, toBN(amount,6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      const newOutside = 500;
      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          toBN(newOutside),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          (await currentTime())
        );

      const NAV=(amount+newOutside)/amount
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOutsideRepository18(10, toBN(NAV));
      await fastForward(20);

      // getAUM revert due to stale time
      await expect(
        hre.f.SC.repositoryContracts[0].repository.getAUM()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].bookKeeper,
        "MarkedValueStale"
      );
      const [lastKnownAUM] =
        await hre.f.SC.repositoryContracts[0].repository.getLastKnownAUM();
      expect(lastKnownAUM).to.be.eq(toBN((newOutside+amount)));
    });

    it("should revert when totalTokenSupply > 0 && AUM == 0", async () => {
      const amount = 100

      await approveAndDepositUSDC(hre.f.alice, toBN(amount,6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      expect(await hre.f.SC.repositoryContracts[0].repository.getAUM()).to.be.eq(toBN(amount))
      expect(await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply()).to.be.eq(toBN(amount))
      expect(await hre.f.SC.repositoryContracts[0].repository.getNAV()).to.be.eq(toBN("1"))

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).
        moveFundsToExecutor(toBN(amount,6))
      await hre.f.SC.repositoryContracts[0].bookKeeper.connect(hre.f.SC.repositoryContracts[0].controller).
        markValueOutsideRepositorySettled(true)

      expect(await hre.f.SC.repositoryContracts[0].repository.getAUM()).to.be
        .eq(await hre.f.SC.strandsAccount.getAccountValue(1))

      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          toBN("0"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          (await currentTime())
        );

      await expect(hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOutsideRepository18(10, toBN("0"))).to.be.
        revertedWith("AUM=0 while totalTokenSupply>0");
    });
  });

  describe("Missing account", function () {
    it("Should NOT updateValueOutsideRepository18 when account tokenid=0", async () => {
      await hre.f.SC.repositoryContracts[0].bookKeeper.setAccountNFT(
        await hre.f.SC.strandsAccount.getAddress(),
        0
      );
      await expect(await hre.f.SC.repositoryContracts[0].bookKeeper.accountTokenId()).to.be.eq(0)
      await expect(hre.f.SC.repositoryContracts[0].bookKeeper
      .connect(hre.f.SC.repositoryContracts[0].controller)
      .updateValueOutsideRepository18(100, toBN("1"))).to.be.revertedWith("Account doesnt exist")
    });

    it("Should NOT updateValueOutsideRepository18 after account is deleted", async () => {
        await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .deleteAccount("firm1", "account number 1",)
        await expect(await hre.f.SC.repositoryContracts[0].bookKeeper.accountTokenId()).to.be.gt(0)
        await expect(hre.f.SC.repositoryContracts[0].bookKeeper
          .connect(hre.f.SC.repositoryContracts[0].controller)
          .updateValueOutsideRepository18(100, toBN("1"))).to.be.revertedWith("Account doesnt exist")
    });
  });

  describe("deposit cap", () => {
    it(`intiate deposit should fail if capReached`, async () => {
      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).
        setTotalValueCap18(toBN("1000"))
      await approveAndDepositUSDC(hre.f.alice, toBN("100",6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),toBN(1000));

      await hre.f.SC.repositoryContracts[0].repository
      .connect(await hre.f.alice)
      .initiateDeposit(toBN("400",6),0);
      
      await expect(hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.alice).initiateDeposit(toBN("1000",6),0)).to.be.
        revertedWithCustomError(hre.f.SC.repositoryContracts[0].repository, "TotalValueCapReached");
    });
  });

  describe("Seed repository with initial outside balance", () => {
    it(`should be able to seed`, async () => {
      //A hedgefund starting with $1000 AUM, 100 share @ NAV=10 off chain
      const finalAUM=toBN("1000")
      const finalTotalSupply=toBN("100")
      const finalNAV=toBN("10")
      expect(await hre.f.SC.repositoryContracts[0].repository.getAUM()).to.be.eq(0)
      expect(await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply()).to.be.eq(0)
      expect(await hre.f.SC.repositoryContracts[0].repository.getNAV()).to.be.eq(toBN("1"))

      await hre.f.SC.strandsAccount
      .connect(hre.f.deployer)
      .updateValues(
        "firm1",
        "account number 1",
        finalAUM,
        ethers.parseEther("2"),
        ethers.parseEther("2"),
        ethers.parseEther("2"),
        await currentTime()
      );

      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOutsideRepository18(100, toBN("1"));

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainDeposit18(finalTotalSupply,toBN("1"), await hre.f.SC.repositoryContracts[0].controller.getAddress())

      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOutsideRepository18(100, finalNAV);

      await hre.f.SC.repositoryContracts[0].bookKeeper.connect(hre.f.SC.repositoryContracts[0].controller).
        markValueOutsideRepositorySettled(true)
      expect(await hre.f.SC.repositoryContracts[0].repository.getNAV()).to.be.eq(finalNAV)
      expect(await hre.f.SC.repositoryContracts[0].repository.getAUM()).to.be.eq(finalAUM)
      expect(await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply()).to.be.eq(finalTotalSupply)
    });
  });
});

import { fastForward } from "../../scripts/utils/evm";
import { seedEmptyRepositoryFixture,} from "../../scripts/utils/fixture";
import {approveAndDepositUSDC} from "../../scripts/seedTestSystem";
import { expect, hre } from "../../scripts/utils/testSetup";
import { toBN,fromBN } from "../../scripts/utils/web3utils";

describe("DirectInputBookKeeper", () => {
  beforeEach(async () => {
    await seedEmptyRepositoryFixture({
      deployNew: true,
      useDirectInputBookKeeper: true,
      useWalletExecutor: true,
    });
  });

  describe("base line testing", () => {
    it("Should be able to mark value of the repository", async () => {
      const oldValue =
        await hre.f.SC.repositoryContracts[0].bookKeeper.getAUM();
      const newValue = toBN("1");
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOutsideRepository18(newValue, 1000, toBN("1", 18));
      const markedValue =
        await hre.f.SC.repositoryContracts[0].bookKeeper.getAUM();
      expect(markedValue).to.equal(newValue);
      expect(markedValue).to.not.equal(oldValue);
    });

    it("should fail to mark the repository value if caller is not controller", async () => {
      const oldValue =
        await hre.f.SC.repositoryContracts[0].bookKeeper.getAUM();
      const newValue = toBN("1");

      await expect(
        hre.f.SC.repositoryContracts[0].bookKeeper
          .connect(hre.f.alice)
          .markValueOutsideRepository18(newValue, 1000, toBN("1", 18))
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].bookKeeper,
        "OnlyRepositoryController"
      );
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.getAUM()
      ).to.be.eq(oldValue);
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
      const NAV=(amount+newOutside)/amount
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOutsideRepository18(toBN(newOutside), 10, toBN(NAV));
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
      const newValue = toBN("1");
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOutsideRepository18(newValue, 10, toBN("1.0", 18));
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
      expect(lastKnownAUM).to.be.eq(toBN("1", 18));
    });

    it("should revert when totalTokenSupply > 0 && AUM == 0", async () => {
      const amount = 100;
      await approveAndDepositUSDC(hre.f.alice, toBN(amount,6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      expect(await hre.f.SC.repositoryContracts[0].repository.getAUM()).to.be.eq(toBN(amount))
      expect(await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply()).to.be.eq(toBN(amount))
      expect(await hre.f.SC.repositoryContracts[0].repository.getNAV()).to.be.eq(toBN("1"))

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).
        moveFundsToExecutor(toBN(amount,6));
      await hre.f.SC.repositoryContracts[0].bookKeeper.connect(hre.f.SC.repositoryContracts[0].controller).
        markValueOutsideRepositorySettled(true)

      expect(await hre.f.SC.repositoryContracts[0].repository.getAUM()).to.be.eq(0)

      await expect(hre.f.SC.repositoryContracts[0].bookKeeper.connect(hre.f.SC.repositoryContracts[0].controller).
        markValueOutsideRepository18(toBN("0"),1000,toBN("1"))).to.be.
        revertedWith("AUM=0 while totalTokenSupply>0");
    });
  });

  describe("Deposit cap", () => {
    it(`intiate deposit should fail if capReached`, async () => {
      const amount = 100;
      await approveAndDepositUSDC(hre.f.alice, toBN(amount,6));
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).
        setTotalValueCap18(toBN("1000"))

      
      await hre.f.SC.MockUSDC.connect(hre.f.alice).approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),toBN(1000));
      await approveAndDepositUSDC(hre.f.alice, toBN(400,6));
      
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

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainDeposit18(finalTotalSupply,toBN("1"), await hre.f.SC.repositoryContracts[0].controller.getAddress())

      await hre.f.SC.repositoryContracts[0].bookKeeper.connect(hre.f.SC.repositoryContracts[0].controller).
        markValueOutsideRepository18(finalAUM,1000,toBN("10"))
      
      await hre.f.SC.repositoryContracts[0].bookKeeper.connect(hre.f.SC.repositoryContracts[0].controller).
        markValueOutsideRepositorySettled(true)
      expect(await hre.f.SC.repositoryContracts[0].repository.getNAV()).to.be.eq(finalNAV)
      expect(await hre.f.SC.repositoryContracts[0].repository.getAUM()).to.be.eq(finalAUM)
      expect(await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply()).to.be.eq(finalTotalSupply)
    });
  });
});

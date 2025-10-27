import { hre, expect, ethers, loadFixture, createFixture, approveAndDeposit, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { fromBN, toBN } from "../helpers/testUtils.js";

describe(`Repository OffChainDeposit & Withdraw - Testing (using directInputBookKeeper)`, function () {
  let alice: any;
  let bob: any;

  const deployContractsFixture = createFixture(
    'directInput',
    'none',
    'USDC',
    true,
    0,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);

    alice = getAlice();
    bob = getBob();
  });

  describe("OffChain Deposit", async () => {
    it("non controller can not call offChainDeposit", async () => {
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(bob)
          .offChainDeposit18(toBN("1000"), toBN("1"), alice.address)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyController"
      );
    });

    it("controller can call the offChainDeposit", async () => {
      // printRepositoryStatus(hre.f.SC.repositoryContracts[0]);

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainDeposit18(toBN("1000"), toBN("1"), alice.address);
      const balance =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          alice.address
        );
      expect(balance).to.be.eq(toBN("1000"));
      // Check valueOffChainSettled set as False
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.valueOffChainSettled()
      ).to.be.eq(false);
    });
  });

  describe("OffChain Withdraw", async () => {
    it("non controller can not call offChainWithdraw", async () => {
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(bob)
          .offChainWithdraw(toBN("1000"), toBN("1"), alice.address)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "OnlyController"
      );
    });

    it("offChainWithdraw not work with wrong custodialWallet", async () => {
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(hre.f.SC.repositoryContracts[0].controller)
          .offChainWithdraw(toBN("1000"), toBN("1"), alice.address)
      ).to.be.revertedWithCustomError(hre.f.SC.repositoryContracts[0].repository, "InsufficientRepositoryTokenBalance"
      );
    });

    it("offChainWithdraw not work with amount > wallet Repository Token balance", async () => {
      // Deposit first
      const offChainDepositAmount = toBN("1000");
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainDeposit18(
          offChainDepositAmount,
          toBN("1"),
          alice.address
        );

      // Check valueOffChainSettled set as False
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.valueOffChainSettled()
      ).to.be.eq(false);
      // mark valueOffChain
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOffChain18(
          offChainDepositAmount,
          1000,
          toBN("1")
        );
      // set valueOffChainSettled to true
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOffChainSettled(true);

      // Call withdraw
      await expect(hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainWithdraw(toBN("2000"), toBN("1"), alice.address)
      ).to.be.revertedWithCustomError(hre.f.SC.repositoryContracts[0].repository, "InsufficientRepositoryTokenBalance");
    });

    it("offChainWithdraw work with correct custodial wallet and amount", async () => {
      // console.log("--before on chain deposit AliceBalance=%s",
      // fromBN(await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(alice.address)))
      // printRepositoryStatus(hre.f.SC.repositoryContracts[0])

      // on chain deposit first
      const amount = toBN("10000", 6);
      await approveAndDeposit(alice, amount, true, 'USDC');

      // Check alice received the correct amount of repository tokens
      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(alice.address)
      ).to.be.closeTo(toBN("10000"), toBN("1"));

      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setAcceptableMarginOfError(toBN("0.00001"));

      // off chain deposit
      const offChainDepositAmount = toBN("1000");
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainDeposit18(
          offChainDepositAmount,
          toBN("1"),
          bob.address
        );

      const userBalancBefore =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          bob
        );
      // console.log("--after off chain deposit AliceBalance=%s", fromBN(userBalancBefore))
      // await printRepositoryStatus(hre.f.SC.repositoryContracts[0])

      // Check valueOffChainSettled set as False
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.valueOffChainSettled()
      ).to.be.eq(false);
      // mark valueOffChain
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOffChain18(
          offChainDepositAmount,
          1000,
          toBN("1")
        );
      // set valueOffChainSettled to true
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOffChainSettled(true);

      // off chain withdraw
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainWithdraw(
          userBalancBefore,
          toBN("1"),
          bob.address
        );
      const userBalanceAfter =
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          bob
        );
      // console.log("--after off chain withdraw AliceBalance=%s", fromBN(userBalanceAfter))
      // await printRepositoryStatus(hre.f.SC.repositoryContracts[0])
      expect(userBalanceAfter).to.be.eq(toBN("0"));
      // Check valueOffChainSettled set as False
      expect(
        await hre.f.SC.repositoryContracts[0].bookKeeper.valueOffChainSettled()
      ).to.be.eq(false);
    });
  });
});

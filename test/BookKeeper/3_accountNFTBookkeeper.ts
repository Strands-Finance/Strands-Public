import { expect, hre, ethers, loadFixture, createFixture, seedWithUSDC, approveAndDeposit, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN,fromBN } from "../helpers/testUtils.js";
import { expectEmit } from "../helpers/chai-helpers.js";
import {
  fastForward,
  restoreSnapshot,
  takeSnapshot,
  currentTime,
} from "../helpers/evm.js";
import { parseUnits } from "ethers";
import type { AccountNFTBookKeeper, Repository, RepositoryToken, TestERC20SetDecimals } from "../../typechain-types/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";



describe(`Repository + accountNFTBookKeeper`, function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  // Contract shortcuts for better readability
  let repo: Repository;
  let repoToken: RepositoryToken;
  let mockUSDC: TestERC20SetDecimals;
  let bookKeeper: AccountNFTBookKeeper;
  let controller: HardhatEthersSigner;

  // Cached addresses to avoid repeated async calls
  let repoAddress: string;
  let aliceAddress: string;
  let bobAddress: string;

  const deployContractsFixture = createFixture(
    'accountNFT',
    'none',
    'USDC',
    true,
    0,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);

    // Initialize signers
    alice = getAlice();
    bob = getBob();

    // Set up contract shortcuts
    repo = hre.f.SC.repositoryContracts[0].repository;
    repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
    mockUSDC = hre.f.SC.MockUSDC;
    bookKeeper = hre.f.SC.repositoryContracts[0].bookKeeper;
    controller = hre.f.SC.repositoryContracts[0].controller;

    // Cache frequently used addresses
    [repoAddress, aliceAddress, bobAddress] = await Promise.all([
      repo.getAddress(),
      alice.getAddress(),
      bob.getAddress()
    ]);

    // Mark valueOffChainSettled as true cause
    // it automatically set as false when setting a account nft
    await hre.f.SC.repositoryContracts[0].bookKeeper
      .connect(hre.f.SC.repositoryContracts[0].controller)
      .markValueOffChainSettled(true);
  });

  describe("NAV Calculations with AccountNFT", function () {
    it("should correctly calculate tokens across multiple scenarios", async function () {
      const charlie = hre.f.signers[10];
      await seedWithUSDC(charlie);

      // Verify initial NAV is 1
      expect(await repo.getNAV()).to.be.closeTo(toBN("1"), toBN("0.001"));

      // Scenario 1: Basic single deposit
      const amount = 100;
      await approveAndDeposit(alice, toBN(amount, 6));
      await repo.connect(controller).processDeposits(1);

      expect(await repoToken.balanceOf(aliceAddress)).to.be.closeTo(toBN(amount), toBN("1"));

      // Scenario 2: Multiple actors with same NAV
      await approveAndDeposit(charlie, toBN(amount, 6));
      await repo.connect(controller).processDeposits(1);

      expect(await repoToken.balanceOf(await charlie.getAddress())).to.be.closeTo(toBN(amount), toBN("1"));
      expect(await repoToken.totalSupply()).to.be.closeTo(toBN(2 * amount), toBN("1"));

      // Scenario 3: NAV change affects token issuance
      const newOutsideValue = 100;
      await fastForward(2);
      await hre.f.SC.strandsAccount
        .connect(hre.f.SC.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          toBN(newOutsideValue),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          await currentTime()
        );

      const expectedNAV = (amount * 2 + newOutsideValue) / (amount * 2); // Total AUM / Total Supply
      await (bookKeeper as AccountNFTBookKeeper)
        .connect(controller)
        .updateValueOffChain18(200, toBN(expectedNAV));

      expect(await repo.getNAV()).to.be.closeTo(toBN(expectedNAV), toBN("0.1"));

      // Scenario 4: New deposit at higher NAV should get fewer tokens
      const david = hre.f.signers[9];
      await seedWithUSDC(david);
      await approveAndDeposit(david, toBN(amount, 6));
      await repo.connect(controller).processDeposits(1);

      const expectedTokens = amount / expectedNAV;
      expect(await repoToken.balanceOf(await david.getAddress())).to.be.closeTo(toBN(expectedTokens), toBN("1"));
    });
  });

  let snapshotId: any;
  describe("AccountStatementStale", function () {
    it("Should fail valueOffChainSettled false", async () => {
      snapshotId = await takeSnapshot();
      fastForward(24 * 3600);
      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOffChainSettled(false);

      const accountTokenId =
        await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper).accountTokenId();
      const accountDetails = await hre.f.SC.strandsAccount.getAccountDetails(
        accountTokenId
      );
      // console.log("curTimestamp=%s validPerid=%s validTimestamp=%s",currentTimestamp,validPeriod,validTimestamp)
      const settled =
        await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper).valueOffChainSettled();
      expect(settled).to.be.false;

      await expect(
        hre.f.SC.repositoryContracts[0].bookKeeper.getNAV()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].bookKeeper,
        "ValueOffChainNotSettled"
      );

      await expect(
        hre.f.SC.repositoryContracts[0].bookKeeper.getAUM()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].bookKeeper,
        "ValueOffChainNotSettled"
      );
    });

    it("Should fail when balance update timestamp>validPeriod and settled=true", async () => {
      // Temporarily increase max price age to allow updateValueOffChain18 to succeed
      await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setMaxPriceAge(48 * 3600); // 48 hours

      fastForward(24 * 3600);

      await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOffChain18(200, toBN("1"));

      // Reset max price age back to normal (24 hours)
      await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setMaxPriceAge(24 * 3600);

      const settled =
        await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper).valueOffChainSettled();
      expect(settled).to.be.true;
      await expect(
        hre.f.SC.repositoryContracts[0].bookKeeper.getAUM()
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].bookKeeper,
        "MarkedValueStale"
      );
    });

    it("Should pass when balance update timestamp<validPeriod and settled=true", async () => {
      const accountNFTBalance=toBN("100")
      await fastForward(2);
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

      await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOffChain18(100, toBN("1"));

      await hre.f.SC.repositoryContracts[0].bookKeeper
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .markValueOffChainSettled(true);

      const accountTokenId =
        await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper).accountTokenId();
      const accountDetails = await hre.f.SC.strandsAccount.getAccountDetails(
        accountTokenId
      );

      const settled =
        await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper).valueOffChainSettled();
      expect(settled).to.be.true;

      const [nav] = await hre.f.SC.repositoryContracts[0].bookKeeper.getNAV();
      expect(nav).to.be.eq(parseUnits("1"));

      await restoreSnapshot(snapshotId);
    });
  });

  describe("Staleness Validation", () => {
    it("should handle both NAV and AUM staleness with getLastKnown fallbacks", async () => {
      const amount = 100;
      await approveAndDeposit(alice, toBN(amount, 6));
      await repo.connect(controller).processDeposits(1);

      const newOutside = 500;
      const { statementTimestamp: existingTimestamp } = await hre.f.SC.strandsAccount.getAccountDetails(1);
      await fastForward(1000);
      const newTimestamp = Number(existingTimestamp) + 1;

      await hre.f.SC.strandsAccount
        .connect(hre.f.SC.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          toBN(newOutside),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          newTimestamp
        );

      const expectedNAV = (amount + newOutside) / amount;
      await (bookKeeper as AccountNFTBookKeeper)
        .connect(controller)
        .updateValueOffChain18(10, toBN(expectedNAV));
      await fastForward(20);

      // Both getNAV and getAUM should revert due to stale time
      await expect(repo.getNAV())
        .to.be.revertedWithCustomError(bookKeeper, "MarkedValueStale");
      await expect(repo.getAUM())
        .to.be.revertedWithCustomError(bookKeeper, "MarkedValueStale");

      // But getLastKnown methods should still work
      const [lastNAV] = await repo.getLastKnownNAV();
      const [lastAUM] = await repo.getLastKnownAUM();
      expect(lastNAV).to.be.eq(toBN(expectedNAV));
      expect(lastAUM).to.be.eq(toBN(newOutside + amount));
    });


    it("should validate AccountNFT business rules", async () => {
      // Test 1: Negative AccountNFT value should revert
      const { statementTimestamp: existingTimestamp } = await hre.f.SC.strandsAccount.getAccountDetails(1);
      await fastForward(20);
      const newTimestamp = Number(existingTimestamp) + 1;

      await hre.f.SC.strandsAccount
        .connect(hre.f.SC.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          toBN("-10"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          newTimestamp
        );

      await expect(
        (bookKeeper as AccountNFTBookKeeper)
          .connect(controller)
          .updateValueOffChain18(10, toBN("0"))
      ).to.be.revertedWithCustomError(bookKeeper, "AccountNFTValueMustBePositive");

      // Test 2: Zero AUM with existing token supply should revert
      const amount = 100;
      await approveAndDeposit(alice, toBN(amount, 6));
      await repo.connect(controller).processDeposits(1);

      // Move all funds out to create zero AUM scenario
      await repo.connect(controller).moveFundsToExecutor(toBN(amount, 6));
      await hre.f.SC.MockUSDC.connect(hre.f.signers[4]).transfer(hre.f.signers[10].address, toBN(amount, 6));
      await bookKeeper.connect(controller).markValueOffChainSettled(true);

      expect(await repo.getAUM()).to.be.eq(0);

      // Set AccountNFT value to 0 and try to update - should revert
      const newTimestamp2 = Number(existingTimestamp) + 2;
      await hre.f.SC.strandsAccount
        .connect(hre.f.SC.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          toBN("0"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          ethers.parseEther("2"),
          newTimestamp2
        );

      await expect(
        (bookKeeper as AccountNFTBookKeeper)
          .connect(controller)
          .updateValueOffChain18(10, toBN("0"))
      ).to.be.revertedWithCustomError(bookKeeper, "NonPositiveAUM");
    });
  });

  describe("Missing account", function () {
    it("Should NOT updateValueOffChain18 when account tokenid=0", async () => {
      await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper).setAccountNFT(
        await hre.f.SC.strandsAccount.getAddress(),
        0
      );
      await expect(await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper).accountTokenId()).to.be.eq(0)
      await expect(
        (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper)
          .connect(hre.f.SC.repositoryContracts[0].controller)
          .updateValueOffChain18(100, toBN("1"))
      ).to.be.revertedWithCustomError(
        (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper),
        "AccountDoesNotExist"
      );
    });

    it("Should NOT updateValueOffChain18 after account is deleted", async () => {
        await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .deleteAccount("firm1", "account number 1",)
        await expect(await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper).accountTokenId()).to.be.gt(0)
        await expect(
          (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper)
            .connect(hre.f.SC.repositoryContracts[0].controller)
            .updateValueOffChain18(100, toBN("1"))
        ).to.be.revertedWithCustomError(
          (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper),
          "AccountDoesNotExist"
        );
    });
  });

  describe("deposit cap", () => {
    it(`intiate deposit should fail if capReached`, async () => {
      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).
        setTotalValueCap18(toBN("1000"))
      await approveAndDeposit(alice, toBN("500",6),true);
      await expect(
        hre.f.SC.repositoryContracts[0].repository
          .connect(alice).initiateDeposit(toBN("1000",6),0)
      ).to.be.revertedWithCustomError(
        hre.f.SC.repositoryContracts[0].repository,
        "TotalValueCapReached"
      );

      // Reset the cap to a high value so subsequent tests don't fail
      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).
        setTotalValueCap18(toBN("100000000"));
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

      await fastForward(2);
      await hre.f.SC.strandsAccount
      .connect(hre.f.deployer)
      .updateValues(
        "firm1",
        "account number 1",
        finalAUM,
        ethers.parseEther("2"),
        ethers.parseEther("2"),
        ethers.parseEther("2"),
        (await currentTime()) - 1
      );

      await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOffChain18(100, toBN("1"));

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller)
        .offChainDeposit18(finalTotalSupply,toBN("1"), await hre.f.SC.repositoryContracts[0].controller.getAddress())

      await (hre.f.SC.repositoryContracts[0].bookKeeper as AccountNFTBookKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .updateValueOffChain18(100, finalNAV);

      await hre.f.SC.repositoryContracts[0].bookKeeper.connect(hre.f.SC.repositoryContracts[0].controller).
        markValueOffChainSettled(true)
      expect(await hre.f.SC.repositoryContracts[0].repository.getNAV()).to.be.eq(finalNAV)
      expect(await hre.f.SC.repositoryContracts[0].repository.getAUM()).to.be.eq(finalAUM)
      expect(await hre.f.SC.repositoryContracts[0].repositoryToken.totalSupply()).to.be.eq(finalTotalSupply)
    });
  });
});

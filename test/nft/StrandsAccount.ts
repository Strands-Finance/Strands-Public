// General
import "dotenv/config";
import { hre, expect, ethers, setHardhatEthers, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import hardhat from "hardhat";
import { fastForward, currentTime } from "../helpers/evm";

describe("StrandsAccount - Testing NFT", () => {
  // Token url
  const url = "https://pin.ski/41aSODW";
  const name = "Strands Account NFT";
  const symbol = "SA";
  let alice: any;
  let bob: any;

  beforeEach(async () => {
    const { ethers: hardhatEthers } = await hardhat.network.connect();
    const signers = await hardhatEthers.getSigners();

    hre.ethers = hardhatEthers;
    setHardhatEthers(hardhatEthers);
    hre.f = {} as any;
    hre.f.signers = signers;
    hre.f.deployer = signers[0];
    hre.f.alice = signers[6];
    hre.f.bob = signers[2];

    alice = hre.f.alice;
    bob = hre.f.bob;

    const { deployTestSystem } = await import("../helpers/deployTestSystem.js");
    // Fix: Pass hardhatEthers explicitly to ensure proper contract deployment
    hre.f.SC = await deployTestSystem('accountNFT', 'none', 'USDC', true, "0", hardhatEthers);
  });

  describe(`Check initial param set correctly`, async () => {
    it(`Check name, symbol`, async () => {
      const nftname = await hre.f.SC.strandsAccount.name();
      expect(nftname).to.eq(name);
      const nftsymbol = await hre.f.SC.strandsAccount.symbol();
      expect(nftsymbol).to.eq(symbol);
    });
  });

  describe(`Mint`, async () => {
    it(`Mint should fail with non-admin`, async () => {
      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.alice)
          .mint(
            hre.f.alice.address,
            "firm1",
            "account number 1",
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            (await currentTime())
          )
      ).to.be.revertedWithCustomError(
        hre.f.SC.strandsAccount,
        "OnlyController"
      );
    });
    it(`Mint should work with admin`, async () => {
      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .mint(
          hre.f.alice.address,
          "firm1",
          "account number 1",
          ethers.parseEther("2").toString(),
          ethers.parseEther("2").toString(),
          ethers.parseEther("2").toString(),
          ethers.parseEther("2").toString(),
          (await currentTime())
        );
      const balance = await hre.f.SC.strandsAccount.balanceOf(
        hre.f.alice.address
      );
      expect(balance).to.eq(1);
      const owner = await hre.f.SC.strandsAccount.getOwner(
        "firm1",
        "account number 1"
      );
      expect(owner).to.eq(hre.f.alice.address);
    });
    it(`Mint should fail with same firm and account number`, async () => {

      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .mint(
          hre.f.alice.address,
          "firm1",
          "account number 1",
          ethers.parseEther("2").toString(),
          ethers.parseEther("2").toString(),
          ethers.parseEther("2").toString(),
          ethers.parseEther("2").toString(),
          (await currentTime())
        );

      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.deployer)
          .mint(
            hre.f.alice.address,
            "firm1",
            "account number 1",
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            (await currentTime())
          )
      ).to.be.revertedWithCustomError(hre.f.SC.strandsAccount, "AlreadyExists");
    });
  });
  describe(`Update values`, async () => {
    beforeEach(async () => {
      // mint an account for tests to update
      await hre.f.SC.strandsAccount.connect(hre.f.deployer).mint(
        hre.f.alice.address,
        "firm1",
        "account number 1",
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        (await currentTime())
      );
    });

    it(`Update fail with non-correct firm and account number`, async () => {
      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.deployer)
          .updateValues(
            "firm2",
            "account number 1",
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            (await currentTime())
          )
      ).to.be.revertedWithCustomError(hre.f.SC.strandsAccount, "DoesNotExist");
    });

    it(`Update fail with timestamp in future`, async () => {
      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.deployer)
          .updateValues(
            "firm1",
            "account number 1",
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            (await currentTime()) + 1000
          )
      ).to.be.revertedWithCustomError(hre.f.SC.strandsAccount, "FutureTimestamp");
    });

    it(`Update work with correct firm and account number`, async () => {
      fastForward(1000)
      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          ethers.parseEther("3").toString(),
          ethers.parseEther("3").toString(),
          ethers.parseEther("3").toString(),
          ethers.parseEther("3").toString(),
          (await currentTime())
        );

      const { accountValue, initialMargin, maintenanceMargin, excessEquity } =
        await hre.f.SC.strandsAccount.getAccountDetails(1);
      expect(accountValue).to.eq(ethers.parseEther("3"));
      expect(initialMargin).to.eq(ethers.parseEther("3"));
      expect(maintenanceMargin).to.eq(ethers.parseEther("3"));
      expect(excessEquity).to.eq(ethers.parseEther("3"));
    });

    it(`Update should fail with same timestamp`, async () => {
      // Get the current timestamp from the account that was minted in beforeEach
      const tokenId = await hre.f.SC.strandsAccount.getTokenId("firm1", "account number 1");
      const details = await hre.f.SC.strandsAccount.getAccountDetails(tokenId);
      const currentStoredTimestamp = details.statementTimestamp;

      // Try to update with the SAME timestamp - should fail
      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.deployer)
          .updateValues(
            "firm1",
            "account number 1",
            ethers.parseEther("3").toString(),
            ethers.parseEther("3").toString(),
            ethers.parseEther("3").toString(),
            ethers.parseEther("3").toString(),
            currentStoredTimestamp
          )
      ).to.be.revertedWithCustomError(hre.f.SC.strandsAccount, "StaleStatement");
    });

    it(`Update should fail with older timestamp`, async () => {
      const initialTimestamp = await currentTime();

      // First, fast forward and update with a newer timestamp
      await fastForward(1000);
      const newerTimestamp = await currentTime();
      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          ethers.parseEther("3").toString(),
          ethers.parseEther("3").toString(),
          ethers.parseEther("3").toString(),
          ethers.parseEther("3").toString(),
          newerTimestamp
        );

      // Now try to update with the original (older) timestamp - should fail
      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.deployer)
          .updateValues(
            "firm1",
            "account number 1",
            ethers.parseEther("4").toString(),
            ethers.parseEther("4").toString(),
            ethers.parseEther("4").toString(),
            ethers.parseEther("4").toString(),
            initialTimestamp
          )
      ).to.be.revertedWithCustomError(hre.f.SC.strandsAccount, "StaleStatement");
    });

    it(`Update should work with just 1 second newer timestamp`, async () => {
      const initialTimestamp = await currentTime();

      // Fast forward 2 seconds
      await fastForward(2);

      // Update with just 1 second newer - should work
      const newerTimestamp = initialTimestamp + 1;
      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .updateValues(
          "firm1",
          "account number 1",
          ethers.parseEther("3").toString(),
          ethers.parseEther("3").toString(),
          ethers.parseEther("3").toString(),
          ethers.parseEther("3").toString(),
          newerTimestamp
        );

      const details = await hre.f.SC.strandsAccount.getAccountDetails(1);
      expect(details.statementTimestamp).to.eq(newerTimestamp);
    });
  });

  describe(`Update values - Multi-account scenarios (Critical: catches mintCounter bug)`, async () => {
    it(`Should update earlier account after minting multiple accounts`, async () => {
      // This test catches the bug where updateValues compares against mintCounter
      // instead of accountTokenId. Without this test, the bug went undetected!

      const baseTime = await currentTime();

      // Mint account 1
      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .mint(
          hre.f.alice.address,
          "Firm1",
          "Account1",
          ethers.parseEther("100").toString(),
          ethers.parseEther("50").toString(),
          ethers.parseEther("40").toString(),
          ethers.parseEther("60").toString(),
          baseTime
        );

      await fastForward(100);

      // Mint account 2
      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .mint(
          hre.f.bob.address,
          "Firm2",
          "Account2",
          ethers.parseEther("200").toString(),
          ethers.parseEther("100").toString(),
          ethers.parseEther("80").toString(),
          ethers.parseEther("120").toString(),
          await currentTime()
        );

      await fastForward(100);

      // Mint account 3
      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .mint(
          hre.f.alice.address,
          "Firm3",
          "Account3",
          ethers.parseEther("300").toString(),
          ethers.parseEther("150").toString(),
          ethers.parseEther("120").toString(),
          ethers.parseEther("180").toString(),
          await currentTime()
        );

      // At this point:
      // - mintCounter = 3 (or higher if previous tests ran)
      // - accountTokenId for "Firm1/Account1" = some earlier value
      // - If buggy code uses mintCounter, it will check the WRONG account!

      await fastForward(100);
      const updateTime = await currentTime();

      // Now update account 1 with a newer timestamp
      // This MUST work, but would FAIL with the mintCounter bug
      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .updateValues(
          "Firm1",
          "Account1",
          ethers.parseEther("150").toString(),
          ethers.parseEther("75").toString(),
          ethers.parseEther("60").toString(),
          ethers.parseEther("90").toString(),
          updateTime
        );

      // Verify the update succeeded
      const tokenId = await hre.f.SC.strandsAccount.getTokenId("Firm1", "Account1");
      const details = await hre.f.SC.strandsAccount.getAccountDetails(tokenId);

      expect(details.accountValue).to.eq(ethers.parseEther("150"));
      expect(details.statementTimestamp).to.eq(updateTime);
    });

    it(`Should update multiple accounts independently`, async () => {
      const baseTime = await currentTime();

      // Mint 3 accounts with different timestamps
      await hre.f.SC.strandsAccount.connect(hre.f.deployer).mint(
        hre.f.alice.address, "Multi1", "Acc1",
        ethers.parseEther("100").toString(),
        ethers.parseEther("50").toString(),
        ethers.parseEther("40").toString(),
        ethers.parseEther("60").toString(),
        baseTime
      );

      await fastForward(50);

      await hre.f.SC.strandsAccount.connect(hre.f.deployer).mint(
        hre.f.alice.address, "Multi2", "Acc2",
        ethers.parseEther("200").toString(),
        ethers.parseEther("100").toString(),
        ethers.parseEther("80").toString(),
        ethers.parseEther("120").toString(),
        await currentTime()
      );

      await fastForward(50);

      await hre.f.SC.strandsAccount.connect(hre.f.deployer).mint(
        hre.f.alice.address, "Multi3", "Acc3",
        ethers.parseEther("300").toString(),
        ethers.parseEther("150").toString(),
        ethers.parseEther("120").toString(),
        ethers.parseEther("180").toString(),
        await currentTime()
      );

      await fastForward(100);
      const updateTime = await currentTime();

      // Update all three accounts with the same timestamp
      // Each should succeed based on ITS OWN stored timestamp, not mintCounter
      await hre.f.SC.strandsAccount.connect(hre.f.deployer).updateValues(
        "Multi1", "Acc1",
        ethers.parseEther("110").toString(),
        ethers.parseEther("55").toString(),
        ethers.parseEther("44").toString(),
        ethers.parseEther("66").toString(),
        updateTime
      );

      await hre.f.SC.strandsAccount.connect(hre.f.deployer).updateValues(
        "Multi2", "Acc2",
        ethers.parseEther("220").toString(),
        ethers.parseEther("110").toString(),
        ethers.parseEther("88").toString(),
        ethers.parseEther("132").toString(),
        updateTime
      );

      await hre.f.SC.strandsAccount.connect(hre.f.deployer).updateValues(
        "Multi3", "Acc3",
        ethers.parseEther("330").toString(),
        ethers.parseEther("165").toString(),
        ethers.parseEther("132").toString(),
        ethers.parseEther("198").toString(),
        updateTime
      );

      // Verify all updates succeeded
      const tokenId1 = await hre.f.SC.strandsAccount.getTokenId("Multi1", "Acc1");
      const details1 = await hre.f.SC.strandsAccount.getAccountDetails(tokenId1);
      expect(details1.accountValue).to.eq(ethers.parseEther("110"));

      const tokenId2 = await hre.f.SC.strandsAccount.getTokenId("Multi2", "Acc2");
      const details2 = await hre.f.SC.strandsAccount.getAccountDetails(tokenId2);
      expect(details2.accountValue).to.eq(ethers.parseEther("220"));

      const tokenId3 = await hre.f.SC.strandsAccount.getTokenId("Multi3", "Acc3");
      const details3 = await hre.f.SC.strandsAccount.getAccountDetails(tokenId3);
      expect(details3.accountValue).to.eq(ethers.parseEther("330"));
    });
  });

  describe(`Approved Traders`, async () => {
    let accounts: any;

    beforeEach(async () => {
      accounts = hre.f.signers;

      // Ensure token ID 1 exists and is owned by alice for these tests
      try {
        const owner = await hre.f.SC.strandsAccount.ownerOf(1);
        if (owner !== hre.f.alice.address) {
          // Token exists but wrong owner - this shouldn't happen in a fresh test
          // but let's handle it gracefully
        }
      } catch (error) {
        // Token doesn't exist, mint it
        await hre.f.SC.strandsAccount
          .connect(hre.f.deployer)
          .mint(
            hre.f.alice.address,
            "firm1",
            "account number 1",
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            (await currentTime())
          );
      }
    });

    it(`SetApprovedTrader fail with non nft owner`, async () => {
      await expect(
        hre.f.SC.strandsAccount
          .connect(accounts[11])
          .setApprovedTraders(1, [
            accounts[10].address,
            accounts[11].address,
            accounts[12].address,
          ])
      ).to.be.revertedWithCustomError(hre.f.SC.strandsAccount, "UnauthorizedOwner");
    });

    it(`SetApprovedTrader only work with nft owner`, async () => {
      await hre.f.SC.strandsAccount
        .connect(hre.f.alice)
        .setApprovedTraders(1, [
          accounts[10].address,
          accounts[11].address,
          accounts[12].address,
          accounts[12].address,
        ]);

      const { approvedTraders } =
        await hre.f.SC.strandsAccount.getAccountDetails(1);

      expect(approvedTraders[0]).to.be.eq(accounts[10].address);
      expect(approvedTraders[1]).to.be.eq(accounts[11].address);
      expect(approvedTraders[2]).to.be.eq(accounts[12].address);

      // Check duplicated one not added
      expect(approvedTraders.length).to.be.eq(3);
    });

    it(`RemoveApprovedTrader fail with non nft owner`, async () => {
      await expect(
        hre.f.SC.strandsAccount
          .connect(accounts[11])
          .removeApprovedTrader(1, accounts[10].address)
      ).to.be.revertedWithCustomError(hre.f.SC.strandsAccount, "UnauthorizedOwner");
    });

    it(`RemoveApprovedTrader fail with not approved trader`, async () => {
      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.alice)
          .removeApprovedTrader(1, accounts[9].address)
      ).to.be.revertedWithCustomError(hre.f.SC.strandsAccount, "NotApprovedTrader");
    });

    it(`RemoveApprovedTrader should work with nft owner and trader in the approvedTrader list`, async () => {
      // First add a trader so we can remove them
      await hre.f.SC.strandsAccount
        .connect(hre.f.alice)
        .setApprovedTraders(1, [accounts[10].address]);

      await hre.f.SC.strandsAccount
        .connect(hre.f.alice)
        .removeApprovedTrader(1, accounts[10].address);
      const { approvedTraders } =
        await hre.f.SC.strandsAccount.getAccountDetails(1);
      expect(approvedTraders.length).to.be.eq(0);
    });
  });

  describe(`Transfer`, async () => {
    beforeEach(async () => {
      // Ensure token ID 1 exists and is owned by alice for transfer tests
      try {
        const owner = await hre.f.SC.strandsAccount.ownerOf(1);
        if (owner !== hre.f.alice.address) {
          // Token exists but wrong owner - this shouldn't happen in a fresh test
          // but let's handle it gracefully
        }
      } catch (error) {
        // Token doesn't exist, mint it
        await hre.f.SC.strandsAccount
          .connect(hre.f.deployer)
          .mint(
            hre.f.alice.address,
            "firm1",
            "account number 1",
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            ethers.parseEther("2").toString(),
            (await currentTime())
          );
      }
    });

    it(`Transfer is not working with wrong from address`, async () => {
      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.deployer)
          .transferFrom(bob.address, hre.f.alice.address, 1)
      ).to.be.revertedWithCustomError(hre.f.SC.strandsAccount, "UnauthorizedOwner");
    });

    it(`Transfer is not working with user call`, async () => {
      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.alice)
          .transferFrom(hre.f.alice.address, bob.address, 1)
      ).to.be.revertedWithCustomError(
        hre.f.SC.strandsAccount,
        "OnlyController"
      );
    });

    it(`TransferAccount should work with correct NFT owner and admin call`, async () => {
      const curTimestamp = (await currentTime());


      await hre.f.SC.strandsAccount.mint(
        hre.f.alice.address,
        "firm2",
        "account number 2",
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        (await currentTime())
      );

      // mint two positions
      await hre.f.SC.strandsPosition
        .connect(hre.f.deployer)
        .mint(
          hre.f.alice.address,
          "bitcoin-future",
          "lyra",
          "firm2",
          "account number 2",
          (await currentTime() + 60 * 60 * 24 * 7),
          {
            tradeId: "hre.f.alice_tradeId",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("2").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: (await currentTime()),
            tradeDate: (await currentTime()),
          }
        );

      // Get the token ID for the account we just minted
      const newTokenId = await hre.f.SC.strandsAccount.getTokenId("firm2", "account number 2");

      const positions = await hre.f.SC.strandsAccount.getPositionsByAccountId(
        newTokenId,
        true
      );

      expect(positions.length).to.be.eq(1);
      expect(positions[0].tokenId).to.be.eq(1);

      await hre.f.SC.strandsAccount.connect(hre.f.deployer).transferAccount(
        "firm2",
        "account number 2",
        bob.address
      );

      const aliceBalance = await hre.f.SC.strandsAccount.balanceOf(
        hre.f.alice.address
      );

      // Alice should have 1 less token (she transferred one but still has the one from beforeEach)
      expect(aliceBalance).to.eq(1);

      const userAccountBalance = await hre.f.SC.strandsAccount.balanceOf(
        bob.address
      );

      expect(userAccountBalance).to.eq(1);

      // transfer back the account
      await hre.f.SC.strandsAccount.connect(hre.f.deployer).transferAccount(
        "firm2",
        "account number 2",
        hre.f.alice.address
      );

      const alicePositionBalance = await hre.f.SC.strandsPosition.balanceOf(
        hre.f.alice.address
      );

      // check alice has the positions
      expect(alicePositionBalance).to.eq(1);

      // bob shouldn't have the positions (after transfer back to alice)
      const bobPositionBalance =
        await hre.f.SC.strandsPosition.balanceOf(bob.address);
      expect(bobPositionBalance).to.eq(0);
    });

    it(`TransferAccount should not work for non existing account`, async () => {
      const curTimestamp = (await currentTime());
      await expect(hre.f.SC.strandsAccount.transferAccount(
        "nofirm",
        "account number 1",
        bob.address
      )).to.be.revertedWithCustomError(hre.f.SC.strandsAccount, "UnauthorizedOwner");
    });

    it(`Get Owner Accounts`, async () => {
      //mint user account
      await hre.f.SC.strandsAccount.mint(
        bob.address,
        "firm1",
        "accountnumber",
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        (await currentTime())
      );

      const accountDetails = await hre.f.SC.strandsAccount.getOwnerAccounts(
        bob.address
      );
      expect(accountDetails.length).to.eq(1);
    });

    it(`DeleteAccount should not work with Account that has a Position`, async () => {
      // Mint a position
      await hre.f.SC.strandsAccount.mint(
        hre.f.alice.address,
        "firm1",
        "accountnumber",
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        (await currentTime())
      );

      await hre.f.SC.strandsPosition
        .connect(hre.f.deployer)
        .mint(
          hre.f.alice.address,
          "hre.f.alice_symbol",
          "lyra",
          "firm1",
          "accountnumber",
          (await currentTime() + 60 * 60 * 24 * 7),
          {
            tradeId: "hre.f.alice_tradeId",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("2").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: (await currentTime()),
            tradeDate: (await currentTime()),
          }
        );

      // console.log(await hre.f.SC.strandsPosition.getPositionDetails(1));

      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.deployer)
          .deleteAccount("firm1", "accountnumber")
      ).to.be.revertedWithCustomError(hre.f.SC.strandsAccount, "AccountHasPositions");
    });

    it(`Delete Account should work with Account with no position`, async () => {
      // have to mint an account to  delete
      await hre.f.SC.strandsAccount.mint(
        hre.f.alice.address,
        "firm1",
        "accountnumber",
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        (await currentTime())
      );

      await hre.f.SC.strandsAccount
        .connect(hre.f.deployer)
        .deleteAccount("firm1", "accountnumber");

      const userAccountBalance = await hre.f.SC.strandsAccount.balanceOf(
        bob.address
      );
      expect(userAccountBalance).to.eq(0);
    });

    
  it('accountId not removing in _ownedAccountsIds [audit issue]', async () => {
    // console.log(chalk.red('Audit Issue: accountId not removing in _ownedAccountsIds'));
    await hre.f.SC.strandsAccount.connect(hre.f.deployer).mint(
      hre.f.alice.address,
      "audit_firm1",
      "audit_account_1",
      ethers.parseEther("2").toString(),
      ethers.parseEther("2").toString(),
      ethers.parseEther("2").toString(),
      ethers.parseEther("2").toString(),
      (await currentTime())
    );

    //mint second account
    await hre.f.SC.strandsAccount.connect(hre.f.deployer).mint(
      hre.f.alice.address,
      "audit_firm1",
      "audit_account_2",
      ethers.parseEther("2").toString(),
      ethers.parseEther("2").toString(),
      ethers.parseEther("2").toString(),
      ethers.parseEther("2").toString(),
      (await currentTime())
    );

    // delete this account
    await hre.f.SC.strandsAccount.connect(hre.f.deployer).deleteAccount(
      'audit_firm1',
      'audit_account_1'
    );

    // get token id of deleted account
    const tokenId = await hre.f.SC.strandsAccount.connect(hre.f.deployer).getTokenId('audit_firm1', 'audit_account_1');
    const ownerAddress = await hre.f.SC.strandsAccount.connect(hre.f.deployer).getOwner('audit_firm1', 'audit_account_1');
    const ownedAccounts = await hre.f.SC.strandsAccount.connect(hre.f.alice).getOwnerAccounts(hre.f.alice.address);
    // should be of length 2 (one from beforeEach + one from this test - one deleted = 2)
    expect(ownedAccounts.length).to.equal(2);

    const ownedAccounts0 = await hre.f.SC.strandsAccount.connect(hre.f.alice).getOwnerAccounts("0x0000000000000000000000000000000000000000");
    // should be of length 1
    expect(ownedAccounts0.length).to.equal(0);
  });
  });
});

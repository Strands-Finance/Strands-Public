// General
import "dotenv/config";
const { expect } = require("chai");
const { ethers } = require("hardhat");
import { hre } from "../../scripts/utils/testSetup";
import { seedFixture } from "../../scripts/utils/fixture";
import { fastForward, currentTime } from "../../scripts/utils/evm";

describe("StrandsAccount - Testing NFT", () => {
  // Token url
  const url = "https://pin.ski/41aSODW";
  const name = "Strands Account NFT";
  const symbol = "SA";
  beforeEach(() => seedFixture({}));

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
      ).to.be.revertedWith("NFT already exist");
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
      ).to.be.revertedWith(
        "NFT doesn't exist with clearingFirm and account number"
      );
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
      ).to.be.revertedWith(
        "Timestamp in future"
      );
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
  });

  describe(`Approved Traders`, async () => {
    const accounts = await ethers.getSigners();

    it(`SetApprovedTrader fail with non nft owner`, async () => {
      await expect(
        hre.f.SC.strandsAccount
          .connect(accounts[11])
          .setApprovedTraders(1, [
            accounts[10].address,
            accounts[11].address,
            accounts[12].address,
          ])
      ).to.be.revertedWith("Not owner of token");
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
      ).to.be.revertedWith("Not owner of token");
    });

    it(`RemoveApprovedTrader fail with not approved trader`, async () => {
      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.alice)
          .removeApprovedTrader(1, accounts[9].address)
      ).to.be.revertedWith("Not approved trader");
    });

    it(`RemoveApprovedTrader should work with nft owner and trader in the approvedTrader list`, async () => {
      await hre.f.SC.strandsAccount
        .connect(hre.f.alice)
        .removeApprovedTrader(1, accounts[10].address);
      const { approvedTraders } =
        await hre.f.SC.strandsAccount.getAccountDetails(1);
      expect(approvedTraders).to.be.eq(2);
    });
  });

  describe(`Transfer`, async () => {
    it(`Transfer is not working with wrong from address`, async () => {
      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.deployer)
          .transferFrom(hre.f.SC.userAccount.address, hre.f.alice.address, 1)
      ).to.be.revertedWith("WRONG_FROM");
    });

    it(`Transfer is not working with user call`, async () => {
      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.alice)
          .transferFrom(hre.f.alice.address, hre.f.SC.userAccount.address, 1)
      ).to.be.revertedWithCustomError(
        hre.f.SC.strandsAccount,
        "OnlyController"
      );
    });

    it(`TransferAccount should work with correct NFT owner and admin call`, async () => {
      const curTimestamp = (await currentTime());


      await hre.f.SC.strandsAccount.mint(
        hre.f.alice.address,
        "firm1",
        "account number 1",
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
          "firm1",
          "account number 1",
          (await currentTime() + 60 * 60 * 24 * 7),
          {
            tradeId: "hre.f.alice_tradeId",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("2").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: (await currentTime()),
          }
        );

      const positions = await hre.f.SC.strandsAccount.getPositionsByAccountId(
        1,
        true
      );

      expect(positions.length).to.be.eq(1);
      expect(positions[0].tokenId).to.be.eq(1);

      await hre.f.SC.strandsAccount.connect(hre.f.deployer).transferAccount(
        "firm1",
        "account number 1",
        hre.f.SC.userAccount.address
      );

      const aliceBalance = await hre.f.SC.strandsAccount.balanceOf(
        hre.f.alice.address
      );

      expect(aliceBalance).to.eq(0);

      const userAccountBalance = await hre.f.SC.strandsAccount.balanceOf(
        hre.f.SC.userAccount.address
      );

      expect(userAccountBalance).to.eq(1);

      // transfer back the account
      await hre.f.SC.strandsAccount.connect(hre.f.deployer).transferAccount(
        "firm1",
        "account number 1",
        hre.f.alice.address
      );

      const alicePositionBalance = await hre.f.SC.strandsPosition.balanceOf(
        hre.f.alice.address
      );

      // check alice has the positions
      expect(alicePositionBalance).to.eq(1);

      // user shouldn't have the positions
      const userAccountPositionBalance =
        await hre.f.SC.strandsPosition.balanceOf(hre.f.SC.userAccount.address);
      expect(userAccountPositionBalance).to.eq(0);
    });

    it(`TransferAccount should not work for non existing account`, async () => {
      const curTimestamp = (await currentTime());
      await expect(hre.f.SC.strandsAccount.transferAccount(
        "nofirm",
        "account number 1",
        hre.f.SC.userAccount.address
      )).to.be.revertedWith("WRONG_FROM")
    });

    it(`Get Owner Accounts`, async () => {
      //mint user account
      await hre.f.SC.strandsAccount.mint(
        hre.f.SC.userAccount.address,
        "firm1",
        "accountnumber",
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        ethers.parseEther("2").toString(),
        (await currentTime())
      );

      const accountDetails = await hre.f.SC.strandsAccount.getOwnerAccounts(
        hre.f.SC.userAccount.address
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
          }
        );

      // console.log(await hre.f.SC.strandsPosition.getPositionDetails(1));

      await expect(
        hre.f.SC.strandsAccount
          .connect(hre.f.deployer)
          .deleteAccount("firm1", "accountnumber")
      ).to.be.revertedWith("Can't delete account with position(s)");
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
        hre.f.SC.userAccount.address
      );
      expect(userAccountBalance).to.eq(0);
    });
  });
});

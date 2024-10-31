import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { StrandsPosition } from "../../typechain-types";
import { currentTime, fastForwardTo } from "../../scripts/utils/evm";
import { ethers } from "hardhat";

import { ethers as ethersNonHardHatPackage } from "ethers";

// General
const { expect } = require("chai");

// Types

describe("StrandsPosition new tests redone state", () => {
  let strandsPosition: StrandsPosition,
    deployer: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    admin: SignerWithAddress,
    accounts: SignerWithAddress[];

  const lastTradingDate = Math.floor(Date.now() / 1000) + 60 * 24 * 7;
  const expiredLastTradingDate = Math.floor(Date.now() / 1000) - 60 * 24 * 7;

  // Token url
  const url = "https://pin.ski/41aSODW";
  const name = "Strands Position NFT";
  const symbol = "SP";

  before(async (): Promise<void> => {
    // Get accounts
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    alice = accounts[1];
    bob = accounts[2];
    admin = accounts[3];
  });

  // helper function to mint a position
  async function MintPositionHelper(
    mintDeployer: SignerWithAddress = alice,
    to: string = alice.address,
    symbol: string = "alice_symbol1",
    exchange: string = "lyra",
    clearingFirm: string = "clearingfirm",
    accountNumber: string = "accountnumber",
    tradingDate: number = lastTradingDate,
    tradeDetails?: {
      tradeId: string;
      tag50: string;
      isLong: boolean;
      quantity: string;
      purchasePrice: string;
      executionTime: string;
    },
  ): Promise<void> {
    if (!tradeDetails) {
      tradeDetails = {
        tradeId: "alice_tradeId1-1",
        tag50: "alice_tag",
        isLong: false,
        quantity: ethers.parseEther("2").toString(),
        purchasePrice: ethers.parseEther("1").toString(),
        executionTime: (await currentTime()).toString(),
      };
    }
    // Mint a position
    await strandsPosition
      .connect(mintDeployer)
      .mint(
        to,
        symbol,
        exchange,
        clearingFirm,
        accountNumber,
        tradingDate,
        tradeDetails
      );
  }

  async function deployContract() {
    // Deploy NFT contract
    const StrandsPositionFactory = await ethers.getContractFactory(
      "StrandsPosition"
    );

    strandsPosition = (await StrandsPositionFactory.connect(deployer).deploy(
      name,
      symbol,
      url
    )) as StrandsPosition;
    await strandsPosition.setIsController(admin.address, true);
  }

  beforeEach(async () => {
    await deployContract();
  });

  describe(`Check initial param set correctly`, async () => {
    it(`Check name, symbol, cap`, async () => {
      const nftname = await strandsPosition.name();
      expect(nftname).to.eq(name);
      const nftsymbol = await strandsPosition.symbol();
      expect(nftsymbol).to.eq(symbol);
    });
  });

  describe(`Mint`, async () => {
    it(`Mint should fail with non admin`, async () => {
      await expect(
        MintPositionHelper(
          alice
        )
      ).to.be.revertedWithCustomError(strandsPosition, "OnlyController");
    });

    it(`Mint should work with admin`, async () => {
      await MintPositionHelper(
        admin
      );
      const balance = await strandsPosition.balanceOf(alice.address);
      expect(balance).to.eq(1);


      const exists = await strandsPosition.tradeIdExists(
        "alice_symbol1",
        "lyra",
        "clearingfirm",
        "accountnumber",
        "alice_tradeId1-1"
      );
    });

    it(`Mint should fail if clearingfirm+account+symbolId already exist`, async () => {
      await MintPositionHelper(
        deployer,
      );

      await expect(
        strandsPosition
          .connect(deployer)
          .mint(
            alice.address,
            "alice_symbol1",
            "lyra",
            "clearingfirm",
            "accountnumber",
            lastTradingDate,
            {
              tradeId: "alice",
              tag50: "alice_tag",
              isLong: false,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("1").toString(),
              executionTime: (await currentTime()),
            }
          )
      ).to.be.revertedWith("Position already exists, use addTrade");
    });
  });

  describe(`Add Trade`, async () => {
    beforeEach(async () => {
      await MintPositionHelper(
        deployer,
      );
    });

    it(`Should fail to add to the trades if owner address is different when position available`, async () => {
      await expect(
        strandsPosition.connect(deployer).addTrade(
          bob.address,
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber",
          lastTradingDate,
          {
            tradeId: "alice_tradeId1-2",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: "1716553051",
          }
        )
      ).to.be.revertedWith("Not correct owner");
    });

    it(`Should fail to add to the trades if owner address is invalid when position available`, async () => {
      await expect(
        strandsPosition.connect(deployer).addTrade(
          "0x0000000000000000000000000000000000000000",
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber",
          lastTradingDate,
          {
            tradeId: "alice_tradeId1-2",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: "1716553051",
          }
        )
      ).to.be.revertedWith("Invalid owner address");
    });

    it(`Should add to the trades if position available and tradeid doesnt exist`, async () => {
      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "alice_symbol1",
        "lyra",
        "clearingfirm",
        "accountnumber",
        lastTradingDate,
        {
          tradeId: "alice_tradeId1-2",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: "1716553051",
        }
      );

      const balance = await strandsPosition.balanceOf(alice.address);
      expect(balance).to.eq(1);
      const [isPositionAvailable, isTradeIdAvailable, tokenId, tokenOwner] =
        await strandsPosition.tradeIdExists(
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber",
          "alice_tradeId1-2"
        );

      expect(isPositionAvailable).to.be.eq(true);
      expect(isTradeIdAvailable).to.be.eq(true);
      expect(tokenId).to.be.eq(1);
      expect(tokenOwner).to.be.eq(alice.address);
    });

    it(`Should NOT addTrade if position and tradeid already exist`, async () => {
      const balance = await strandsPosition.balanceOf(alice.address);
      expect(balance).to.eq(1);
      const [isPositionAvailable, isTradeIdAvailable, tokenId, tokenOwner] =
        await strandsPosition.tradeIdExists(
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber",
          "alice_tradeId1-1"
        );

      expect(isPositionAvailable).to.be.eq(true);
      expect(isTradeIdAvailable).to.be.eq(true);
      expect(tokenId).to.be.eq(1);
      expect(tokenOwner).to.be.eq(alice.address);

      await expect(strandsPosition.connect(deployer).addTrade(
        alice.address,
        "alice_symbol1",
        "lyra",
        "clearingfirm",
        "accountnumber",
        lastTradingDate,
        {
          tradeId: "alice_tradeId1-1",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: "1716553051",
        }
      )).to.be.revertedWith("Trade already exists")
    });

    it(`Should NOT add to the trades if tradeid exist on another position`, async () => {
      await expect(strandsPosition.connect(deployer).addTrade(
        alice.address,
        "alice_symbol2",
        "lyra",
        "clearingfirm",
        "accountnumber",
        lastTradingDate,
        {
          tradeId: "alice_tradeId1-1",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: "1716553051",
        }
      )).to.be.revertedWith("Trade already exists")
    });

    it(`Should mint if position not available`, async () => {
      const positionId = await strandsPosition.connect(deployer).getTokenId("clearingfirm", "accountnumber", "alice_symbol2", "lyra")
      expect(positionId).to.eq(0);
      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "alice_symbol2",
        "lyra",
        "clearingfirm",
        "accountnumber",
        lastTradingDate,
        {
          tradeId: "alice_tradeId2-1",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: "1716552051",
        }
      );
      const balance = await strandsPosition.balanceOf(alice.address);
      expect(balance).to.eq(2);
    });

    it(`Should return correct owned positions`, async () => {
      let ownedPositions = await strandsPosition.getOwnerPositions(
        bob.address
      );
      expect(ownedPositions.length).to.eq(0);

      await strandsPosition.connect(deployer).addTrade(
        bob.address,
        "bob)_symbol1",
        "lyra",
        "clearingfirm",
        "accountnumber",
        lastTradingDate,
        {
          tradeId: "bob_symbol_Id1-3",
          tag50: "bob_tag",
          isLong: false,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: "1716553051",
        }
      );
      ownedPositions = await strandsPosition.getOwnerPositions(
        bob.address
      );
      expect(ownedPositions.length).to.eq(1);
      expect(ownedPositions[0].tradeIds.length).to.eq(1);

    });

    it("Should return correct trades between time in getTradesBetween function", async () => {
      const beginTime = 1716552050; // Hardcoded begin time
      const endTime = 1716554050; // Hardcoded end time

      // 2000 seconds between them

      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "alice_symbol1",
        "lyra",
        "clearingfirm",
        "accountnumber",
        lastTradingDate,
        {
          tradeId: "alice_tradeId1-2",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: beginTime + 100, // Hardcoded execution time
        }
      );

      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "alice_symbol1",
        "lyra",
        "clearingfirm",
        "accountnumber",
        lastTradingDate,
        {
          tradeId: "alice_tradeId1-3",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: endTime - 100, // Hardcoded execution time
        }
      );

      // should only get the first trade
      const trades1 = await strandsPosition.getTradesBetween(
        beginTime,
        (beginTime + 300)
      );

      expect(trades1.length).to.be.eq(1);

      const trades2 = await strandsPosition.getTradesBetween(
        beginTime,
        endTime
      );

      expect(trades2.length).to.be.eq(2);
    });
  });

  describe(`Transfer`, async () => {
    beforeEach(async () => {
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber",
          lastTradingDate,
          {
            tradeId: "alice_tradeId1-1",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("2").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: "1716555051",
          }
        );
    });

    it(`Alice can't transfer NFT to Bob`, async () => {
      await expect(
        strandsPosition
          .connect(alice)
          .transferFrom(alice.address, bob.address, 1)
      ).to.be.revertedWithCustomError(strandsPosition, "OnlyController");
    });

    it(`Admin can transfer NFT from Alice to Bob`, async () => {
      await strandsPosition
        .connect(admin)
        .transferFrom(alice.address, bob.address, 1);

      const aliceBalance = await strandsPosition.balanceOf(alice.address);
      expect(aliceBalance).to.eq(0);
      const aliceOwnedPositions = await strandsPosition.getOwnerPositions(
        alice.address
      );
      expect(aliceOwnedPositions.length).to.eq(0);
      const bobBalance = await strandsPosition.balanceOf(bob.address);
      expect(bobBalance).to.eq(1);
      const bobOwnedPositions = await strandsPosition.getOwnerPositions(
        bob.address
      );
      expect(bobOwnedPositions.length).to.eq(1);
    });

    it(`Should transfer fail with not owned token id`, async () => {
      await expect(
        strandsPosition
          .connect(admin)
          .transferFrom(alice.address, bob.address, 2)
      ).to.be.revertedWith("WRONG_FROM");
    });

    it(`Can batch transfer`, async () => {
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "alice_symbol2",
          "lyra",
          "clearingfirm",
          "accountnumber",
          lastTradingDate,
          {
            tradeId: "alice_tradeId2-1",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("2").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: "1716555051",
          }
        );

      let bobOwnedPositions = await strandsPosition.getOwnerPositions(
        bob.address
      );
      expect(bobOwnedPositions.length).to.eq(0);

      let aliceOwnedPositions = await strandsPosition.getOwnerPositions(
        alice.address
      );
      expect(aliceOwnedPositions.length).to.eq(2);

      const alicePids = aliceOwnedPositions.map(struct => struct.tokenId)
      expect(alicePids.length).to.eq(2);

      await strandsPosition
        .connect(admin)
        .batchTransferFrom(alice.address, bob.address, alicePids);

      let bobBalance = await strandsPosition.balanceOf(bob.address);
      expect(bobBalance).to.eq(2);
      bobOwnedPositions = await strandsPosition.getOwnerPositions(
        bob.address
      );
      expect(bobOwnedPositions.length).to.eq(2);

      let aliceBalance = await strandsPosition.balanceOf(alice.address);
      expect(aliceBalance).to.eq(0);
      aliceOwnedPositions = await strandsPosition.getOwnerPositions(
        alice.address
      );
      expect(aliceOwnedPositions.length).to.eq(0);
    });
  });

  describe(`Delete Trade`, async () => {
    beforeEach(async () => {
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber",
          lastTradingDate,
          {
            tradeId: "alice_tradeId1-1",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("2").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: "1716555051",
          }
        );
      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "alice_symbol1",
        "lyra",
        "clearingfirm",
        "accountnumber",
        lastTradingDate,
        {
          tradeId: "alice_tradeId1-2",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: "1716553051",
        }
      );
      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "alice_symbol1",
        "lyra",
        "clearingfirm",
        "accountnumber",
        lastTradingDate,
        {
          tradeId: "alice_tradeId1-3",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: "1716554051",
        }
      );
    });

    //default position tokenId=1: 'clearingfirm'+'accountnumber'+1 
    //                 tradeIds:[ 'alice_tradeId1-1','alice_tradeId1-2','alice_tradeId1-3']
    //                 symbol=''alice_symbol1' exchange='lyra'

    it(`Shouldn't delete with no matching clearingfirm+account+symbolId`, async () => {
      let positions = await strandsPosition.getOwnerPositions(alice.address);
      // for (let i=0;i<positions.length;i++) {
      //   console.log('position[%s]=%s',i,positions[i])
      //   console.log('  symbol+exchange=%s',await strandsPosition.symbolIdToSymbol(positions[i].symbolId))
      //   console.log('  tradeIds=%s',positions[i].tradeIds)
      // }
      expect(positions[0].tradeIds.length).to.eq(3);
      await expect(
        strandsPosition
          .connect(deployer)
          .deleteTrade(
            alice.address,
            "alice_tradeId1-1",
            "alice_symbolX",
            "lyra",
            "clearingfirm",
            "accountnumber"
          )
      ).to.be.revertedWith("Trade doesnt exist");
    });

    it(`Shouldn't delete with matching clearingfirm+account+symbolId but missing trade id`, async () => {
      let positions = await strandsPosition.getOwnerPositions(alice.address);
      expect(positions[0].tradeIds.length).to.eq(3);
      await expect(
        strandsPosition
          .connect(deployer)
          .deleteTrade(
            alice.address,
            "alice_tradeId1-X",
            "alice_symbol1",
            "lyra",
            "clearingfirm",
            "accountnumber"
          )
      ).to.be.revertedWith("Trade doesnt exist");
    });


    it(`Shouldn't delete with exising trade id but no match clearingfirm+account+symbolId`, async () => {
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "alice_symbol2",
          "lyra",
          "clearingfirm",
          "accountnumber",
          lastTradingDate,
          {
            tradeId: "alice_tradeId2-1",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("2").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: "1716555051",
          }
        );
      let positions = await strandsPosition.getOwnerPositions(alice.address);
      // for (let i=0;i<positions.length;i++) {
      //   console.log('position[%s]=%s',i,positions[i])
      //   console.log('  symbol+exchange=%s',await strandsPosition.symbolIdToSymbol(positions[i].symbolId))
      //   console.log('  tradeIds=%s',positions[i].tradeIds)
      //   console.log('--------------')
      // }
      expect(positions.length).to.eq(2);
      expect(positions[0].tradeIds.length).to.eq(3);
      await expect(
        strandsPosition
          .connect(deployer)
          .deleteTrade(
            alice.address,
            "alice_tradeId2-1",
            "alice_symbol1",
            "lyra",
            "clearingfirm",
            "accountnumber"
          )
      ).to.be.revertedWith("Trade doesnt exist");
    });

    it(`Should not delete with wrong owner address`, async () => {
      let positions = await strandsPosition.getOwnerPositions(alice.address);
      expect(positions[0].tradeIds.length).to.eq(3);
      await expect(
        strandsPosition
          .connect(deployer)
          .deleteTrade(
            bob.address,
            "alice_tradeId1-1",
            "alice_symbol1",
            "lyra",
            "clearingfirm",
            "accountnumber"
          )
      ).to.be.revertedWith("Not correct owner");
    });

    it(`Should delete trade`, async () => {
      let positions = await strandsPosition.getOwnerPositions(alice.address);
      const tradesBeforeDelete = await strandsPosition.getTradesBetween(
        "0",
        "2716556050"
      );
      expect(positions[0].tradeIds.length).to.eq(3);
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          alice.address,
          "alice_tradeId1-1",
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber"
        );
      positions = await strandsPosition.getOwnerPositions(alice.address);
      expect(positions[0].tradeIds.length).to.eq(2);
    });

    it("Deleted trade cant be included in return of getTradesBetween function", async () => {
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          alice.address,
          "alice_tradeId1-1",
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber"
        );
      const trades = await strandsPosition.getTradesBetween(
        "0",
        "2716556050"
      );
      expect(trades.some((trade) => trade.tradeId === "alice_tradeId1-1")).to
        .be.false;
    });

    it(`Should burn position if there's no trade after deletion`, async () => {
      let positions = await strandsPosition.getOwnerPositions(alice.address);
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          alice.address,
          "alice_tradeId1-1",
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber"
        );
      positions = await strandsPosition.getOwnerPositions(alice.address);
      expect(positions[0].tradeIds.length).to.eq(2);
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          alice.address,
          "alice_tradeId1-2",
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber"
        );
      positions = await strandsPosition.getOwnerPositions(alice.address);
      expect(positions[0].tradeIds.length).to.eq(1);
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          alice.address,
          "alice_tradeId1-3",
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber"
        );
      positions = await strandsPosition.getOwnerPositions(alice.address);
      expect(positions.length).to.eq(0);
    });
  });

  describe(`Expire Position`, async () => {
    beforeEach(async () => {
      await deployContract();
    });

    it(`Should fail with non admin wallets`, async () => {
      await expect(
        strandsPosition.connect(alice).expirePosition(1)
      ).to.be.revertedWithCustomError(strandsPosition, "OnlyController");
    });

    it(`Shouldn't be able to expire position before expiry date`, async () => {
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber",
          lastTradingDate,
          {
            tradeId: "alice_tradeId1-1",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("2").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: "1716555051",
          }
        );

      await expect(
        strandsPosition.connect(admin).expirePosition(1)
      ).to.be.revertedWith("before lastTradingDate");
    });

    it("Should expire position with admin wallets and emit events", async () => {
      // mint position
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber",
          lastTradingDate,
          {
            tradeId: "alice_tradeId1-1",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("2").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: "1716555051",
          }
        );

      // Fast forward time to after the expiry date
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 8]); // 8 days
      await ethers.provider.send("evm_mine", []);

      await expect(strandsPosition.connect(admin).expirePosition(1))
        .to.emit(strandsPosition, "PositionExpired")
        .withArgs(alice, 1);

      const position = await strandsPosition.getPositionDetails(1);
      expect(position.expired).to.be.true;
    });

    it("Check getAllPositions function work properly", async () => {
      // add a trade
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber",
          lastTradingDate,
          {
            tradeId: "alice_tradeId1-1",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("2").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: "1716555051",
          }
        );

      const positions = await strandsPosition.getAllPositions(true);
      expect(positions.length).to.be.greaterThan(0);
    });

    it("Should not include expired position in getTradesBetween result", async () => {
      // Fast forward time to after the expiry date
      await ethers.provider.send("evm_increaseTime", [60 * 60 * 24 * 8]); // 8 days
      await ethers.provider.send("evm_mine", []);

      await strandsPosition.connect(admin).expirePosition(1);

      const trades = await strandsPosition.getTradesBetween(
        "0",
        (await ethers.provider.getBlock("latest")).timestamp.toString()
      );
      expect(trades).to.not.include(1);
    });
  });

  describe(`Update token symbol`, async () => {
    beforeEach(async () => {
      await deployContract();
    });

    it(`Admin can update token symbol, hashMap should be updated`, async () => {
      // mint a position
      await strandsPosition.connect(admin).mint(
        alice.address,
        "alice_symbol_generic",
        "lyra",
        "clearingfirm",
        "accountnumber",
        lastTradingDate,
        {
          tradeId: "alice_tradeId1-1",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("2").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: await currentTime(),
        }
      );

      expect(await strandsPosition.mintCounter()).equal(1);

      let symbolAndSource = await strandsPosition.symbolIdToSymbol(1);
      expect(symbolAndSource.symbol).equal("alice_symbol_generic");
      expect(symbolAndSource.source).equal("lyra");

      await strandsPosition.connect(admin).updateInfoForSymbolId(1, "new_symbol", "new_source");

      symbolAndSource = await strandsPosition.symbolIdToSymbol(1);
      expect(symbolAndSource.symbol).equal("new_symbol");
      expect(symbolAndSource.source).equal("new_source");

      const position = await strandsPosition.getPositionDetails(1);

      const encoderInstance = (ethersNonHardHatPackage.AbiCoder.defaultAbiCoder());

      const altPacking = encoderInstance.encode(
        ["string", "string", "uint256"],
        ["clearingfirm", "accountnumber", position.symbolId]
      );
      // hash with keccak256
      const hashed = ethersNonHardHatPackage.keccak256(altPacking);

      const tokenId = await strandsPosition.getCasToTokenId(
        hashed
      );

      expect(tokenId).to.equal(1);
    });
  });

  describe(`Expire all positions`, async () => {
    beforeEach(async () => {
      await deployContract();
    });

    it(`Expire all positions and should fire events for unexpired positions`, async () => {

      const lastTrading = (await currentTime()) + 60 * 60 * 24 * 8;
      await strandsPosition.connect(admin).mint(
        alice.address,
        "alice_symbol_generic",
        "lyra",
        "clearingfirm",
        "accountnumber",
        lastTrading,
        {
          tradeId: "alice_tradeId1-1",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("2").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: lastTradingDate - 60 * 60 * 24 * 2,
        }
      );

      await strandsPosition.connect(admin).mint(
        alice.address,
        "alice_symbol_generic2",
        "lyra2",
        "clearingfirm2",
        "accountnumber2",
        lastTrading,
        {
          tradeId: "alice_tradeId1-2",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("2").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: lastTradingDate - 60 * 60 * 24 * 2,
        }
      );

      // Fast forward time to after the expiry date
      await fastForwardTo((await currentTime()) + 60 * 60 * 24 * 20); // 8 days

      await expect(strandsPosition.connect(admin).expirePositions([1, 2]))
        .to.emit(strandsPosition, "PositionExpired")
        .withArgs(alice.address, 1)

      const position1 = await strandsPosition.getPositionDetails(1);
      const position2 = await strandsPosition.getPositionDetails(2);
      expect(position1.expired).to.be.true;
      expect(position2.expired).to.be.true;
    });
  });

  describe("checking clashing", async () => {
    beforeEach(async () => {
      await deployContract();
    });

    it(`Should fail to update symbolInfo if the new symbol+exchange already exists for another symbolId`, async () => {
      // mint a position
      const retUnit = await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "alice_symbol_generic",
          "lyra",
          "clearingfirm",
          "accountnumber",
          lastTradingDate,
          {
            tradeId: "alice_tradeId1-1",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("2").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: await currentTime(),
          }
        );

      // mint new position to increase symbolId 
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "alice_symbol_generic2",
          "lyra2",
          "clearingfirm2",
          "accountnumber2",
          lastTradingDate,
          {
            tradeId: "alice_tradeId1-2",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("2").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: await currentTime(),
          }
        );

      await strandsPosition.connect(admin).updateInfoForSymbolId(1, "new_symbol", "new_source");

      await expect(
        strandsPosition.connect(admin).updateInfoForSymbolId(2, "new_symbol", "new_source")
      ).to.be.revertedWith("New symbol and source already exist for another symbolId");
    });

    it(`Should fail to update token symbol if clearing already exists`, async () => {
      await strandsPosition.mint(
        alice.address,
        "alice_symbol_generic",
        "lyra",
        "clearingfirm",
        "accountnumber",
        lastTradingDate,
        {
          tradeId: "alice_tradeId1-1",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("2").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: await currentTime(),
        }
      );


      await strandsPosition.connect(admin).updateInfoForSymbolId(1, "new_symbol", "new_source");

      await expect(
        strandsPosition.connect(admin).updateInfoForSymbolId(1, "new_symbol", "new_source")
      ).to.be.revertedWith("New symbol and source already exist for another symbolId");
    });
  });

  describe(`Alt symbols`, async () => {
    beforeEach(async () => {
      await deployContract();
    });

    it(`Should be able to update altSymbol`, async () => {
      // mint a position
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "alice_symbol_generic",
          "lyra",
          "clearingfirm",
          "accountnumber",
          lastTradingDate,
          {
            tradeId: "alice_tradeId1-1",
            tag50: "alice_tag",
            isLong: false,
            quantity: ethers.parseEther("2").toString(),
            purchasePrice: ethers.parseEther("1").toString(),
            executionTime: await currentTime(),
          }
        );

      await strandsPosition.updateAltSymbolsForSymbolId(1, [
        {
          source: "source1",
          symbol: "altsymbol1",
        },
        {
          source: "source2",
          symbol: "altsymbol2",
        },
      ]);

      const altSymbolInfos = await strandsPosition.GetSymbolIdToAltSymbol(1);

      expect(altSymbolInfos.length).to.be.eq(2);
      expect(altSymbolInfos[0].source).to.be.eq("source1");
      expect(altSymbolInfos[0].symbol).to.be.eq("altsymbol1");
      expect(altSymbolInfos[1].source).to.be.eq("source2");
      expect(altSymbolInfos[1].symbol).to.be.eq("altsymbol2");
    });
  });
});

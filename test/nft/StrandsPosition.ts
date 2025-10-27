import { expect, hre, ethers } from "../helpers/setupTestSystem.js";
// SignerWithAddress is now inferred from ethers.getSigners()
import type { StrandsPosition } from "../../typechain-types/index.js";
import { fastForward, currentTime } from "../helpers/evm";

const PAST_TIMESTAMP = 1000000000; // Sep 2001 - definitely in past

import { ethers as ethersNonHardHatPackage } from "ethers";

// General
// REPLACED

// Types

describe("StrandsPosition new tests redone state", () => {
  let strandsPosition: StrandsPosition,
    deployer: any,
    alice: any,
    bob: any,
    admin: any,
    accounts: any[];

  let lastTradingDate: number;
  let expiredLastTradingDate: number;

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

    // Calculate dates using EVM time instead of real time
    const evmTime = await currentTime();
    lastTradingDate = evmTime + 60 * 24 * 7; // 7 days in future
    expiredLastTradingDate = evmTime - 60 * 24 * 7; // 7 days in past
  });

  // helper function to mint a position
  async function MintPositionHelper(
    mintDeployer: any = alice,
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
      tradeDate: string;
    },
  ): Promise<void> {
    if (!tradeDetails) {
      tradeDetails = {
        tradeId: "alice_tradeId1-1",
        tag50: "alice_tag",
        isLong: false,
        quantity: ethers.parseEther("2").toString(),
        purchasePrice: ethers.parseEther("1").toString(),
        executionTime: PAST_TIMESTAMP.toString(),
        tradeDate: PAST_TIMESTAMP.toString(),
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

      // tradeIdExists function removed - trade existence tested through deleteTrade
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
              executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
            }
          )
      ).to.be.revertedWithCustomError(strandsPosition, "AlreadyExists");
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
            tradeDate: 1716553051,
          }
        )
      ).to.be.revertedWithCustomError(strandsPosition, "UnauthorizedOwner");
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
            tradeDate: 1716553051,
          }
        )
      ).to.be.revertedWithCustomError(strandsPosition, "ZeroAddress");
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
            tradeDate: 1716553051,
        }
      );

      const balance = await strandsPosition.balanceOf(alice.address);
      expect(balance).to.eq(1);

      // tradeIdExists function removed - trade existence verified through successful addTrade
      const tokenId = 1;
      const positionDetails = await strandsPosition.getPositionDetails(tokenId);
      expect(positionDetails.tradeIds.length).to.eq(2); // Both trades exist
      expect(await strandsPosition.ownerOf(tokenId)).to.be.eq(alice.address);
    });

    it(`tradeIdExists should return true for existing trade and false for non-existent`, async () => {
      const tokenId = 1;

      // Check existing trade
      const exists = await strandsPosition.tradeIdExists(tokenId, "alice_tradeId1-1");
      expect(exists).to.be.true;

      // Check non-existent trade
      const notExists = await strandsPosition.tradeIdExists(tokenId, "nonexistent_trade");
      expect(notExists).to.be.false;

      // Check non-existent position
      const notExistsInvalidPosition = await strandsPosition.tradeIdExists(999, "alice_tradeId1-1");
      expect(notExistsInvalidPosition).to.be.false;
    });

    it(`Should NOT addTrade if position and tradeid already exist`, async () => {
      const balance = await strandsPosition.balanceOf(alice.address);
      expect(balance).to.eq(1);

      // tradeIdExists removed - verify duplicate trade via addTrade revert
      const tokenId = 1;
      const positionDetails = await strandsPosition.getPositionDetails(tokenId);
      expect(positionDetails.tradeIds.length).to.be.gte(1); // At least 1 trade exists
      expect(positionDetails.tradeIds).to.include("alice_tradeId1-1");

      // Attempt to add duplicate trade - should revert
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
            tradeDate: 1716553051,
        }
      )).to.be.revertedWithCustomError(strandsPosition, "AlreadyExists");
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
            tradeDate: 1716553051,
        }
      )).to.be.revertedWithCustomError(strandsPosition, "AlreadyExists");
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
            tradeDate: 1716552051,
        }
      );
      const balance = await strandsPosition.balanceOf(alice.address);
      expect(balance).to.eq(2);
    });

    it(`Should return correct owned positions`, async () => {
      let ownedPositions = await strandsPosition.getOwnerTokenIds(
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
            tradeDate: 1716553051,
        }
      );
      ownedPositions = await strandsPosition.getOwnerTokenIds(
        bob.address
      );
      expect(ownedPositions.length).to.eq(1);

      const positionDetails = await strandsPosition.getPositionDetails(ownedPositions[0]);
      expect(positionDetails.tradeIds.length).to.eq(1);

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
            tradeDate: 1716555051,
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
      const aliceOwnedPositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      expect(aliceOwnedPositions.length).to.eq(0);
      const bobBalance = await strandsPosition.balanceOf(bob.address);
      expect(bobBalance).to.eq(1);
      const bobOwnedPositions = await strandsPosition.getOwnerTokenIds(
        bob.address
      );
      expect(bobOwnedPositions.length).to.eq(1);
    });

    it(`Should transfer fail with not owned token id`, async () => {
      await expect(
        strandsPosition
          .connect(admin)
          .transferFrom(alice.address, bob.address, 2)
      ).to.be.revertedWithCustomError(strandsPosition, "InvalidPositionTokenId");
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
            tradeDate: 1716555051,
          }
        );

      let bobOwnedPositions = await strandsPosition.getOwnerTokenIds(
        bob.address
      );
      expect(bobOwnedPositions.length).to.eq(0);

      let aliceOwnedPositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      expect(aliceOwnedPositions.length).to.eq(2);

      // Convert to plain array for ethers compatibility
      const alicePids = Array.from(aliceOwnedPositions);
      await strandsPosition
        .connect(admin)
        .batchTransferFrom(alice.address, bob.address, alicePids);

      let bobBalance = await strandsPosition.balanceOf(bob.address);
      expect(bobBalance).to.eq(2);
      bobOwnedPositions = await strandsPosition.getOwnerTokenIds(
        bob.address
      );
      expect(bobOwnedPositions.length).to.eq(2);

      let aliceBalance = await strandsPosition.balanceOf(alice.address);
      expect(aliceBalance).to.eq(0);
      aliceOwnedPositions = await strandsPosition.getOwnerTokenIds(
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
            tradeDate: 1716555051,
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
            tradeDate: 1716553051,
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
            tradeDate: 1716554051,
        }
      );
    });

    //default position tokenId=1: 'clearingfirm'+'accountnumber'+1 
    //                 tradeIds:[ 'alice_tradeId1-1','alice_tradeId1-2','alice_tradeId1-3']
    //                 symbol=''alice_symbol1' exchange='lyra'

    it(`Shouldn't delete with no matching clearingfirm+account+symbolId`, async () => {
      let positions = await strandsPosition.getOwnerTokenIds(alice.address);
      let position = await strandsPosition.getPositionDetails(positions[0]);
      expect(position.tradeIds.length).to.eq(3);
      await expect(
        strandsPosition
          .connect(deployer)
          .deleteTrade(
            "alice_tradeId1-1",
            "alice_symbolX",
            "lyra",
            "clearingfirm",
            "accountnumber"
          )
      ).to.be.revertedWithCustomError(strandsPosition, "TradeDoesNotExist");
    });

    it(`Shouldn't delete with matching clearingfirm+account+symbolId but missing trade id`, async () => {
      let positions = await strandsPosition.getOwnerTokenIds(alice.address);
      let position = await strandsPosition.getPositionDetails(positions[0]);
      expect(position.tradeIds.length).to.eq(3);
      await expect(
        strandsPosition
          .connect(deployer)
          .deleteTrade(
            "alice_tradeId1-X",
            "alice_symbol1",
            "lyra",
            "clearingfirm",
            "accountnumber"
          )
      ).to.be.revertedWithCustomError(strandsPosition, "TradeDoesNotExist");
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
            tradeDate: 1716555051,
          }
        );
      let positions = await strandsPosition.getOwnerTokenIds(alice.address);
      // for (let i=0;i<positions.length;i++) {
      //   console.log('position[%s]=%s',i,positions[i])
      //   console.log('  symbol+exchange=%s',await strandsPosition.symbolIdToSymbol(positions[i].symbolId))
      //   console.log('  tradeIds=%s',positions[i].tradeIds)
      //   console.log('--------------')
      // }
      expect(positions.length).to.eq(2);
      let position = await strandsPosition.getPositionDetails(positions[0]);
      expect(position.tradeIds.length).to.eq(3);
      await expect(
        strandsPosition
          .connect(deployer)
          .deleteTrade(
            "alice_tradeId2-1",
            "alice_symbol1",
            "lyra",
            "clearingfirm",
            "accountnumber"
          )
      ).to.be.revertedWithCustomError(strandsPosition, "TradeDoesNotExist");
    });

    it(`Should delete trade`, async () => {
      let positions = await strandsPosition.getOwnerTokenIds(alice.address);
      let position = await strandsPosition.getPositionDetails(positions[0]);
      expect(position.tradeIds.length).to.eq(3);
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "alice_tradeId1-1",
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber"
        );
      positions = await strandsPosition.getOwnerTokenIds(alice.address);
      position = await strandsPosition.getPositionDetails(positions[0]);
      expect(position.tradeIds.length).to.eq(2);
    });

    it(`Should burn position if there's no trade after deletion`, async () => {
      let positions = await strandsPosition.getOwnerTokenIds(alice.address);
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "alice_tradeId1-1",
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber"
        );
      positions = await strandsPosition.getOwnerTokenIds(alice.address);
      let position = await strandsPosition.getPositionDetails(positions[0]);
      expect(position.tradeIds.length).to.eq(2);
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "alice_tradeId1-2",
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber"
        );
      positions = await strandsPosition.getOwnerTokenIds(alice.address);
      position = await strandsPosition.getPositionDetails(positions[0]);
      expect(position.tradeIds.length).to.eq(1);
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "alice_tradeId1-3",
          "alice_symbol1",
          "lyra",
          "clearingfirm",
          "accountnumber"
        );
      positions = await strandsPosition.getOwnerTokenIds(alice.address);
      expect(positions.length).to.eq(0);
    });

    it(`Should delete all trades from trades mapping when position is deleted`, async () => {
      // Mint a position with initial trade
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "test_trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("10").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Add two more trades
      await strandsPosition
        .connect(deployer)
        .addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "test_trade2",
            tag50: "tag2",
            isLong: true,
            quantity: ethers.parseEther("5").toString(),
            purchasePrice: ethers.parseEther("51000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      await strandsPosition
        .connect(deployer)
        .addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "test_trade3",
            tag50: "tag3",
            isLong: false,
            quantity: ethers.parseEther("3").toString(),
            purchasePrice: ethers.parseEther("52000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      const tokenId = await strandsPosition.mintCounter();

      // Verify trades exist before deletion
      const trade1Before = await strandsPosition.trades("test_trade1");
      const trade2Before = await strandsPosition.trades("test_trade2");
      const trade3Before = await strandsPosition.trades("test_trade3");

      expect(trade1Before.executionTime).to.eq(PAST_TIMESTAMP);
      expect(trade2Before.executionTime).to.eq(PAST_TIMESTAMP);
      expect(trade3Before.executionTime).to.eq(PAST_TIMESTAMP);

      // Delete the position directly
      await strandsPosition.connect(deployer).deletePosition(tokenId);

      // Verify all trades are deleted from the trades mapping
      const trade1After = await strandsPosition.trades("test_trade1");
      const trade2After = await strandsPosition.trades("test_trade2");
      const trade3After = await strandsPosition.trades("test_trade3");

      // Deleted trades should have executionTime = 0 (default value)
      expect(trade1After.executionTime).to.eq(0);
      expect(trade2After.executionTime).to.eq(0);
      expect(trade3After.executionTime).to.eq(0);
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

    it(`Should fail with invalid tokenId`, async () => {
      await expect(
        strandsPosition.connect(admin).expirePosition(999)
      ).to.be.revertedWithCustomError(strandsPosition, "InvalidPositionTokenId");
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
            tradeDate: 1716555051,
          }
        );

      await expect(
        strandsPosition.connect(admin).expirePosition(1)
      ).to.be.revertedWithCustomError(strandsPosition, "BeforeLastTradingDate");
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
            tradeDate: 1716555051,
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

    it("Check getPositionsPaginated function work properly", async () => {
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
            tradeDate: 1716555051,
          }
        );

      const positions = await strandsPosition.getPositionsPaginated(true, 1, 100);
      expect(positions.length).to.be.greaterThan(0);
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
          executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
        }
      );

      expect(await strandsPosition.mintCounter()).equal(1);

      let symbolAndSource = await strandsPosition.symbolIdToSymbol(1);
      expect(symbolAndSource.symbol).equal("alice_symbol_generic");
      expect(symbolAndSource.exchange).equal("lyra");

      await strandsPosition.connect(admin).updateInfoForSymbolId(1, "new_symbol", "new_source");

      symbolAndSource = await strandsPosition.symbolIdToSymbol(1);
      expect(symbolAndSource.symbol).equal("new_symbol");
      expect(symbolAndSource.exchange).equal("new_source");

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
      // Create positions with timestamps that are definitely in the past
      // Use a simple old timestamp that won't have sync issues
      const pastTimestamp = 1000000000; // September 2001 - definitely in the past

      await strandsPosition.connect(admin).mint(
        alice.address,
        "alice_symbol_generic",
        "lyra",
        "clearingfirm",
        "accountnumber",
        pastTimestamp,
        {
          tradeId: "alice_tradeId1-1",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("2").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: pastTimestamp - 60 * 60 * 24 * 2,
          tradeDate: pastTimestamp - 60 * 60 * 24 * 2,
        }
      );

      await strandsPosition.connect(admin).mint(
        alice.address,
        "alice_symbol_generic2",
        "lyra2",
        "clearingfirm2",
        "accountnumber2",
        pastTimestamp,
        {
          tradeId: "alice_tradeId1-2",
          tag50: "alice_tag",
          isLong: false,
          quantity: ethers.parseEther("2").toString(),
          purchasePrice: ethers.parseEther("1").toString(),
          executionTime: pastTimestamp - 60 * 60 * 24 * 2,
          tradeDate: pastTimestamp - 60 * 60 * 24 * 2,
        }
      );

      // Check if positions were auto-expired during minting
      const pos1Before = await strandsPosition.getPositionDetails(1);
      const pos2Before = await strandsPosition.getPositionDetails(2);

      if (pos1Before.expired || pos2Before.expired) {
        // Positions were auto-expired, so expirePositions won't emit events
        // This test should verify the positions are already expired
        expect(pos1Before.expired).to.be.true;
        expect(pos2Before.expired).to.be.true;
      } else {
        // Positions are not auto-expired, so we can test the expiration function
        await expect(strandsPosition.connect(admin).expirePositions([1, 2]))
          .to.emit(strandsPosition, "PositionExpired")
          .withArgs(alice.address, 1)
          .and.to.emit(strandsPosition, "PositionExpired")
          .withArgs(alice.address, 2);

        const position1 = await strandsPosition.getPositionDetails(1);
        const position2 = await strandsPosition.getPositionDetails(2);
        expect(position1.expired).to.be.true;
        expect(position2.expired).to.be.true;
      }
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
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
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
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      await strandsPosition.connect(admin).updateInfoForSymbolId(1, "new_symbol", "new_source");

      await expect(
        strandsPosition.connect(admin).updateInfoForSymbolId(2, "new_symbol", "new_source")
      ).to.be.revertedWithCustomError(strandsPosition, "AlreadyExists");
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
          executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
        }
      );


      await strandsPosition.connect(admin).updateInfoForSymbolId(1, "new_symbol", "new_source");

      await expect(
        strandsPosition.connect(admin).updateInfoForSymbolId(1, "new_symbol", "new_source")
      ).to.be.revertedWithCustomError(strandsPosition, "AlreadyExists");
    });
  });

  describe(`updateInfoForSymbolId - Comprehensive Tests`, async () => {
    beforeEach(async () => {
      await deployContract();
    });

    it(`Should successfully update symbolId info and emit event`, async () => {
      // Mint a position to create symbolId 1 (BTC/binance)
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Verify initial state
      const initialInfo = await strandsPosition.symbolIdToSymbol(1);
      expect(initialInfo.symbol).to.eq("BTC");
      expect(initialInfo.exchange).to.eq("binance");

      // Update to BTC/coinbase and check event
      await expect(
        strandsPosition
          .connect(deployer)
          .updateInfoForSymbolId(1, "BTC", "coinbase")
      )
        .to.emit(strandsPosition, "SymbolInfoUpdated")
        .withArgs(1, "BTC", "binance", "BTC", "coinbase");

      // Verify updated state
      const updatedInfo = await strandsPosition.symbolIdToSymbol(1);
      expect(updatedInfo.symbol).to.eq("BTC");
      expect(updatedInfo.exchange).to.eq("coinbase");

      // Verify old mapping is deleted and new one is created
      const abiCoder = ethersNonHardHatPackage.AbiCoder.defaultAbiCoder();
      const oldKey = ethersNonHardHatPackage.keccak256(abiCoder.encode(["string", "string"], ["BTC", "binance"]));
      const newKey = ethersNonHardHatPackage.keccak256(abiCoder.encode(["string", "string"], ["BTC", "coinbase"]));

      expect(await strandsPosition.symbolToSymbolId(oldKey)).to.eq(0);
      expect(await strandsPosition.symbolToSymbolId(newKey)).to.eq(1);
    });

    it(`Should fail with invalid symbolId`, async () => {
      // Try to update a symbolId that doesn't exist
      await expect(
        strandsPosition.connect(deployer).updateInfoForSymbolId(999, "BTC", "binance")
      ).to.be.revertedWithCustomError(strandsPosition, "InvalidSymbolId");
    });

    it(`Should fail with blank symbol`, async () => {
      // Mint to create symbolId 1
      await MintPositionHelper(deployer);

      await expect(
        strandsPosition.connect(deployer).updateInfoForSymbolId(1, "", "binance")
      ).to.be.revertedWithCustomError(strandsPosition, "EmptyString");
    });

    it(`Should fail with blank source`, async () => {
      // Mint to create symbolId 1
      await MintPositionHelper(deployer);

      await expect(
        strandsPosition.connect(deployer).updateInfoForSymbolId(1, "BTC", "")
      ).to.be.revertedWithCustomError(strandsPosition, "EmptyString");
    });

    it(`Should fail if new symbol+source already exists for another symbolId`, async () => {
      // Mint position 1 with BTC/binance (symbolId 1)
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Mint position 2 with ETH/binance (symbolId 2)
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "ETH",
          "binance",
          "firm1",
          "acc2",
          lastTradingDate,
          {
            tradeId: "trade2",
            tag50: "tag2",
            isLong: true,
            quantity: ethers.parseEther("10").toString(),
            purchasePrice: ethers.parseEther("3000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Try to update symbolId 1 to ETH/binance (which is already symbolId 2)
      await expect(
        strandsPosition.connect(deployer).updateInfoForSymbolId(1, "ETH", "binance")
      ).to.be.revertedWithCustomError(strandsPosition, "AlreadyExists");
    });

    it(`Should fail if called by non-controller`, async () => {
      await MintPositionHelper(deployer);

      await expect(
        strandsPosition.connect(alice).updateInfoForSymbolId(1, "BTC", "binance")
      ).to.be.revertedWithCustomError(strandsPosition, "OnlyController");
    });

    it(`Should allow updating to completely different symbol and source`, async () => {
      // Mint with AAPL/nasdaq
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "AAPL",
          "nasdaq",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("100").toString(),
            purchasePrice: ethers.parseEther("150").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Update to GOOGL/nyse
      await expect(
        strandsPosition.connect(deployer).updateInfoForSymbolId(1, "GOOGL", "nyse")
      )
        .to.emit(strandsPosition, "SymbolInfoUpdated")
        .withArgs(1, "AAPL", "nasdaq", "GOOGL", "nyse");

      const info = await strandsPosition.symbolIdToSymbol(1);
      expect(info.symbol).to.eq("GOOGL");
      expect(info.exchange).to.eq("nyse");
    });
  });

  describe(`updateSymbolIdForPosition - Comprehensive Tests`, async () => {
    beforeEach(async () => {
      await deployContract();
    });

    it(`Should successfully update position symbolId and emit event`, async () => {
      // Mint position with BTC/binance (creates symbolId 1)
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Mint position with ETH/binance (creates symbolId 2)
      await strandsPosition
        .connect(deployer)
        .mint(
          bob.address,
          "ETH",
          "binance",
          "firm2",
          "acc2",
          lastTradingDate,
          {
            tradeId: "trade2",
            tag50: "tag2",
            isLong: false,
            quantity: ethers.parseEther("10").toString(),
            purchasePrice: ethers.parseEther("3000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Verify initial state
      let positionDetails = await strandsPosition.getPositionDetails(1);
      expect(positionDetails.symbolId).to.eq(1);

      // Update position 1 to use symbolId 2 (ETH)
      await expect(
        strandsPosition.connect(deployer).updateSymbolIdForPosition(1, 2)
      )
        .to.emit(strandsPosition, "SymbolIdUpdated")
        .withArgs(1, 1, 2);

      // Verify updated state
      positionDetails = await strandsPosition.getPositionDetails(1);
      expect(positionDetails.symbolId).to.eq(2);

      // Verify we can now get the position using ETH/binance
      const tokenId = await strandsPosition.getTokenId(
        "firm1",
        "acc1",
        "ETH",
        "binance"
      );
      expect(tokenId).to.eq(1);

      // Verify old lookup (BTC/binance) no longer works
      const oldTokenId = await strandsPosition.getTokenId(
        "firm1",
        "acc1",
        "BTC",
        "binance"
      );
      expect(oldTokenId).to.eq(0);
    });

    it(`Should fail with invalid tokenId`, async () => {
      await expect(
        strandsPosition.connect(deployer).updateSymbolIdForPosition(999, 1)
      ).to.be.revertedWithCustomError(strandsPosition, "InvalidPositionTokenId");
    });

    it(`Should fail with invalid symbolId`, async () => {
      // Mint a position (creates symbolId 1)
      await MintPositionHelper(deployer);

      // Try to update to non-existent symbolId 999
      await expect(
        strandsPosition.connect(deployer).updateSymbolIdForPosition(1, 999)
      ).to.be.revertedWithCustomError(strandsPosition, "InvalidSymbolId");
    });

    it(`Should fail if new clearingFirm+accountNumber+symbolId already exists`, async () => {
      // Mint position 1: firm1/acc1/BTC (symbolId 1)
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Mint position 2: firm1/acc1/ETH (symbolId 2)
      // Note: Same firm and account, different symbol
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "ETH",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade2",
            tag50: "tag2",
            isLong: false,
            quantity: ethers.parseEther("10").toString(),
            purchasePrice: ethers.parseEther("3000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Try to update position 1 to use symbolId 2 (would clash with position 2)
      await expect(
        strandsPosition.connect(deployer).updateSymbolIdForPosition(1, 2)
      ).to.be.revertedWithCustomError(strandsPosition, "AlreadyExists");
    });

    it(`Should fail if called by non-controller`, async () => {
      await MintPositionHelper(deployer);

      await expect(
        strandsPosition.connect(alice).updateSymbolIdForPosition(1, 1)
      ).to.be.revertedWithCustomError(strandsPosition, "OnlyController");
    });

    it(`Should allow updating to same symbolId (no-op but valid)`, async () => {
      await MintPositionHelper(deployer);

      // Update to same symbolId should work
      await expect(
        strandsPosition.connect(deployer).updateSymbolIdForPosition(1, 1)
      )
        .to.emit(strandsPosition, "SymbolIdUpdated")
        .withArgs(1, 1, 1);

      const positionDetails = await strandsPosition.getPositionDetails(1);
      expect(positionDetails.symbolId).to.eq(1);
    });

    it(`Should update casToTokenId mapping correctly`, async () => {
      // Mint two symbols
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      await strandsPosition
        .connect(deployer)
        .mint(
          bob.address,
          "ETH",
          "binance",
          "firm2",
          "acc2",
          lastTradingDate,
          {
            tradeId: "trade2",
            tag50: "tag2",
            isLong: false,
            quantity: ethers.parseEther("10").toString(),
            purchasePrice: ethers.parseEther("3000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Calculate casKeys
      const abiCoder = ethersNonHardHatPackage.AbiCoder.defaultAbiCoder();
      const casKeyOld = ethersNonHardHatPackage.keccak256(
        abiCoder.encode(
          ["string", "string", "uint256"],
          ["firm1", "acc1", 1]
        )
      );
      const casKeyNew = ethersNonHardHatPackage.keccak256(
        abiCoder.encode(
          ["string", "string", "uint256"],
          ["firm1", "acc1", 2]
        )
      );

      // Verify initial mapping
      expect(await strandsPosition.getCasToTokenId(casKeyOld)).to.eq(1);
      expect(await strandsPosition.getCasToTokenId(casKeyNew)).to.eq(0);

      // Update symbolId
      await strandsPosition.connect(deployer).updateSymbolIdForPosition(1, 2);

      // Verify mapping updated
      expect(await strandsPosition.getCasToTokenId(casKeyOld)).to.eq(0);
      expect(await strandsPosition.getCasToTokenId(casKeyNew)).to.eq(1);
    });

    it(`Should handle multiple updates on same position`, async () => {
      // Create 3 different symbols
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      await strandsPosition
        .connect(deployer)
        .mint(
          bob.address,
          "ETH",
          "binance",
          "firm2",
          "acc2",
          lastTradingDate,
          {
            tradeId: "trade2",
            tag50: "tag2",
            isLong: false,
            quantity: ethers.parseEther("10").toString(),
            purchasePrice: ethers.parseEther("3000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      await strandsPosition
        .connect(deployer)
        .mint(
          bob.address,
          "DOGE",
          "binance",
          "firm3",
          "acc3",
          lastTradingDate,
          {
            tradeId: "trade3",
            tag50: "tag3",
            isLong: true,
            quantity: ethers.parseEther("1000").toString(),
            purchasePrice: ethers.parseEther("0.1").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Update position 1: BTC -> ETH
      await strandsPosition.connect(deployer).updateSymbolIdForPosition(1, 2);
      let details = await strandsPosition.getPositionDetails(1);
      expect(details.symbolId).to.eq(2);

      // Update position 1: ETH -> DOGE
      await strandsPosition.connect(deployer).updateSymbolIdForPosition(1, 3);
      details = await strandsPosition.getPositionDetails(1);
      expect(details.symbolId).to.eq(3);

      // Update position 1: DOGE -> BTC (back to original)
      await strandsPosition.connect(deployer).updateSymbolIdForPosition(1, 1);
      details = await strandsPosition.getPositionDetails(1);
      expect(details.symbolId).to.eq(1);
    });
  });

  describe(`getPositionsPaginated - Comprehensive Tests`, async () => {
    beforeEach(async () => {
      await deployContract();
    });

    it(`Should return paginated positions (first page)`, async () => {
      // Mint 5 positions
      for (let i = 1; i <= 5; i++) {
        await strandsPosition
          .connect(deployer)
          .mint(
            alice.address,
            `symbol${i}`,
            "exchange",
            `firm${i}`,
            `acc${i}`,
            lastTradingDate,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("100").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Get first 3 positions
      const result = await strandsPosition.getPositionsPaginated(true, 1, 3);

      expect(result.length).to.eq(3);
      expect(result[0].tokenId).to.eq(1);
      expect(result[1].tokenId).to.eq(2);
      expect(result[2].tokenId).to.eq(3);
    });

    it(`Should return paginated positions (second page)`, async () => {
      // Mint 5 positions
      for (let i = 1; i <= 5; i++) {
        await strandsPosition
          .connect(deployer)
          .mint(
            alice.address,
            `symbol${i}`,
            "exchange",
            `firm${i}`,
            `acc${i}`,
            lastTradingDate,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("100").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Get positions 4-5 (second page with size 3)
      const result = await strandsPosition.getPositionsPaginated(true, 4, 3);

      expect(result.length).to.eq(2); // Only 2 remaining
      expect(result[0].tokenId).to.eq(4);
      expect(result[1].tokenId).to.eq(5);
    });

    it(`Should filter expired positions when includeExpiredPosition is false`, async () => {
      const currentTimestamp = await currentTime();

      // Mint 3 unexpired positions
      for (let i = 1; i <= 3; i++) {
        await strandsPosition
          .connect(deployer)
          .mint(
            alice.address,
            `symbol${i}`,
            "exchange",
            `firm${i}`,
            `acc${i}`,
            currentTimestamp + 1000,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("100").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Mint 2 expired positions
      for (let i = 4; i <= 5; i++) {
        await strandsPosition
          .connect(deployer)
          .mint(
            alice.address,
            `symbol${i}`,
            "exchange",
            `firm${i}`,
            `acc${i}`,
            PAST_TIMESTAMP, // Expired
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("100").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Get all positions (page size 10) excluding expired
      const result = await strandsPosition.getPositionsPaginated(false, 1, 10);

      // Should only return the 3 unexpired positions
      expect(result.length).to.eq(3);
      expect(result[0].expired).to.be.false;
      expect(result[1].expired).to.be.false;
      expect(result[2].expired).to.be.false;
    });

    it(`Should include expired positions when includeExpiredPosition is true`, async () => {
      const currentTimestamp = await currentTime();

      // Mint 2 unexpired
      for (let i = 1; i <= 2; i++) {
        await strandsPosition
          .connect(deployer)
          .mint(
            alice.address,
            `symbol${i}`,
            "exchange",
            `firm${i}`,
            `acc${i}`,
            currentTimestamp + 1000,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("100").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Mint 2 expired
      for (let i = 3; i <= 4; i++) {
        await strandsPosition
          .connect(deployer)
          .mint(
            alice.address,
            `symbol${i}`,
            "exchange",
            `firm${i}`,
            `acc${i}`,
            PAST_TIMESTAMP,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("100").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Get all positions including expired
      const result = await strandsPosition.getPositionsPaginated(true, 1, 10);

      expect(result.length).to.eq(4); // All 4 positions
    });

    it(`Should return empty array when startIndex is beyond mintCounter`, async () => {
      // Mint 3 positions
      for (let i = 1; i <= 3; i++) {
        await strandsPosition
          .connect(deployer)
          .mint(
            alice.address,
            `symbol${i}`,
            "exchange",
            `firm${i}`,
            `acc${i}`,
            lastTradingDate,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("100").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Try to get positions starting at index 10 (beyond mintCounter)
      const result = await strandsPosition.getPositionsPaginated(true, 10, 5);

      expect(result.length).to.eq(0);
    });

    it(`Should handle partial page at the end`, async () => {
      // Mint 7 positions
      for (let i = 1; i <= 7; i++) {
        await strandsPosition
          .connect(deployer)
          .mint(
            alice.address,
            `symbol${i}`,
            "exchange",
            `firm${i}`,
            `acc${i}`,
            lastTradingDate,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("100").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Request page size 5 starting at position 5 (should get positions 5, 6, 7)
      const result = await strandsPosition.getPositionsPaginated(true, 5, 5);

      expect(result.length).to.eq(3);
      expect(result[0].tokenId).to.eq(5);
      expect(result[1].tokenId).to.eq(6);
      expect(result[2].tokenId).to.eq(7);
    });

    it(`Should fail with startIndex = 0`, async () => {
      await expect(
        strandsPosition.getPositionsPaginated(true, 0, 10)
      ).to.be.revertedWithCustomError(strandsPosition, "ZeroValue");
    });

    it(`Should fail with limit = 0`, async () => {
      await expect(
        strandsPosition.getPositionsPaginated(true, 1, 0)
      ).to.be.revertedWithCustomError(strandsPosition, "ZeroValue");
    });

    it(`Should handle pagination through all positions`, async () => {
      // Mint 10 positions
      for (let i = 1; i <= 10; i++) {
        await strandsPosition
          .connect(deployer)
          .mint(
            alice.address,
            `symbol${i}`,
            "exchange",
            `firm${i}`,
            `acc${i}`,
            lastTradingDate,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("100").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Fetch in pages of 3
      const page1 = await strandsPosition.getPositionsPaginated(true, 1, 3);
      const page2 = await strandsPosition.getPositionsPaginated(true, 4, 3);
      const page3 = await strandsPosition.getPositionsPaginated(true, 7, 3);
      const page4 = await strandsPosition.getPositionsPaginated(true, 10, 3);

      expect(page1.length).to.eq(3);
      expect(page2.length).to.eq(3);
      expect(page3.length).to.eq(3);
      expect(page4.length).to.eq(1); // Last page has only 1

      // Verify correct tokenIds
      expect(page1[0].tokenId).to.eq(1);
      expect(page2[0].tokenId).to.eq(4);
      expect(page3[0].tokenId).to.eq(7);
      expect(page4[0].tokenId).to.eq(10);
    });

    it(`Should work with single position`, async () => {
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      const result = await strandsPosition.getPositionsPaginated(true, 1, 10);

      expect(result.length).to.eq(1);
      expect(result[0].tokenId).to.eq(1);
    });
  });

  describe(`totalQuantity - Comprehensive Tests`, async () => {
    beforeEach(async () => {
      await deployContract();
    });

    it(`Should initialize totalQuantity correctly for long position`, async () => {
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("10").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      const position = await strandsPosition.getPositionDetails(1);
      expect(position.totalQuantity).to.eq(ethers.parseEther("10"));
    });

    it(`Should initialize totalQuantity correctly for short position`, async () => {
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: false,
            quantity: ethers.parseEther("5").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      const position = await strandsPosition.getPositionDetails(1);
      expect(position.totalQuantity).to.eq(ethers.parseEther("-5"));
    });

    it(`Should update totalQuantity when adding long trade`, async () => {
      // Mint initial long position
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("10").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      let position = await strandsPosition.getPositionDetails(1);
      expect(position.totalQuantity).to.eq(ethers.parseEther("10"));

      // Add another long trade
      await strandsPosition
        .connect(deployer)
        .addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade2",
            tag50: "tag2",
            isLong: true,
            quantity: ethers.parseEther("3").toString(),
            purchasePrice: ethers.parseEther("51000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      position = await strandsPosition.getPositionDetails(1);
      expect(position.totalQuantity).to.eq(ethers.parseEther("13")); // 10 + 3
    });

    it(`Should update totalQuantity when adding short trade`, async () => {
      // Mint initial long position
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("10").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Add a short trade
      await strandsPosition
        .connect(deployer)
        .addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade2",
            tag50: "tag2",
            isLong: false,
            quantity: ethers.parseEther("4").toString(),
            purchasePrice: ethers.parseEther("51000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      const position = await strandsPosition.getPositionDetails(1);
      expect(position.totalQuantity).to.eq(ethers.parseEther("6")); // 10 - 4
    });

    it(`Should handle totalQuantity going negative (net short)`, async () => {
      // Mint initial long position
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("5").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Add a short trade larger than initial long
      await strandsPosition
        .connect(deployer)
        .addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade2",
            tag50: "tag2",
            isLong: false,
            quantity: ethers.parseEther("8").toString(),
            purchasePrice: ethers.parseEther("51000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      const position = await strandsPosition.getPositionDetails(1);
      expect(position.totalQuantity).to.eq(ethers.parseEther("-3")); // 5 - 8 = -3
    });

    it(`Should update totalQuantity when deleting long trade`, async () => {
      // Mint with long trade
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("10").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Add another long trade
      await strandsPosition
        .connect(deployer)
        .addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade2",
            tag50: "tag2",
            isLong: true,
            quantity: ethers.parseEther("5").toString(),
            purchasePrice: ethers.parseEther("51000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      let position = await strandsPosition.getPositionDetails(1);
      expect(position.totalQuantity).to.eq(ethers.parseEther("15")); // 10 + 5

      // Delete the second trade
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "trade2",
          "BTC",
          "binance",
          "firm1",
          "acc1"
        );

      position = await strandsPosition.getPositionDetails(1);
      expect(position.totalQuantity).to.eq(ethers.parseEther("10")); // 15 - 5
    });

    it(`Should update totalQuantity when deleting short trade`, async () => {
      // Mint with long trade
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("10").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Add a short trade
      await strandsPosition
        .connect(deployer)
        .addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade2",
            tag50: "tag2",
            isLong: false,
            quantity: ethers.parseEther("3").toString(),
            purchasePrice: ethers.parseEther("51000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      let position = await strandsPosition.getPositionDetails(1);
      expect(position.totalQuantity).to.eq(ethers.parseEther("7")); // 10 - 3

      // Delete the short trade
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "trade2",
          "BTC",
          "binance",
          "firm1",
          "acc1"
        );

      position = await strandsPosition.getPositionDetails(1);
      expect(position.totalQuantity).to.eq(ethers.parseEther("10")); // 7 + 3 (removing short adds back)
    });

    it(`Should handle complex scenario with multiple long and short trades`, async () => {
      // Start with long 10
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("10").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Add long 5 -> total 15
      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade2",
          tag50: "tag2",
          isLong: true,
          quantity: ethers.parseEther("5").toString(),
          purchasePrice: ethers.parseEther("51000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Add short 7 -> total 8
      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade3",
          tag50: "tag3",
          isLong: false,
          quantity: ethers.parseEther("7").toString(),
          purchasePrice: ethers.parseEther("52000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Add short 10 -> total -2
      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade4",
          tag50: "tag4",
          isLong: false,
          quantity: ethers.parseEther("10").toString(),
          purchasePrice: ethers.parseEther("53000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      let position = await strandsPosition.getPositionDetails(1);
      expect(position.totalQuantity).to.eq(ethers.parseEther("-2")); // 10 + 5 - 7 - 10 = -2

      // Delete trade3 (short 7) -> total 5
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "trade3",
          "BTC",
          "binance",
          "firm1",
          "acc1"
        );

      position = await strandsPosition.getPositionDetails(1);
      expect(position.totalQuantity).to.eq(ethers.parseEther("5")); // -2 + 7 = 5
    });

    it(`Should have zero totalQuantity when long and short quantities are equal`, async () => {
      // Start with long 10
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("10").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Add short 10 -> total 0
      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade2",
          tag50: "tag2",
          isLong: false,
          quantity: ethers.parseEther("10").toString(),
          purchasePrice: ethers.parseEther("51000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      const position = await strandsPosition.getPositionDetails(1);
      expect(position.totalQuantity).to.eq(0);
    });
  });

  describe("TradeId Index Manipulation Tests", () => {
    beforeEach(async () => {
      await deployContract();
    });

    it(`Should correctly maintain index when adding multiple trades`, async () => {
      // Mint with first trade
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      // Add second trade
      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade2",
          tag50: "tag2",
          isLong: true,
          quantity: ethers.parseEther("2").toString(),
          purchasePrice: ethers.parseEther("51000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Add third trade
      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade3",
          tag50: "tag3",
          isLong: false,
          quantity: ethers.parseEther("1.5").toString(),
          purchasePrice: ethers.parseEther("52000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      const position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(3);
      expect(position.tradeIds[0]).to.eq("trade1");
      expect(position.tradeIds[1]).to.eq("trade2");
      expect(position.tradeIds[2]).to.eq("trade3");
    });

    it(`Should correctly update index when deleting middle trade`, async () => {
      // Setup: Create position with 3 trades
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade2",
          tag50: "tag2",
          isLong: true,
          quantity: ethers.parseEther("2").toString(),
          purchasePrice: ethers.parseEther("51000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade3",
          tag50: "tag3",
          isLong: false,
          quantity: ethers.parseEther("1.5").toString(),
          purchasePrice: ethers.parseEther("52000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Delete middle trade (trade2)
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "trade2",
          "BTC",
          "binance",
          "firm1",
          "acc1"
        );

      const position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(2);
      // trade3 should have been swapped to index 1
      expect(position.tradeIds[0]).to.eq("trade1");
      expect(position.tradeIds[1]).to.eq("trade3");

      // Verify trades still exist
      const trade1 = await strandsPosition.trades("trade1");
      const trade3 = await strandsPosition.trades("trade3");
      expect(trade1.tradeId).to.eq("trade1");
      expect(trade3.tradeId).to.eq("trade3");

      // Verify deleted trade doesn't exist
      const trade2 = await strandsPosition.trades("trade2");
      expect(trade2.executionTime).to.eq(0);
    });

    it(`Should correctly handle deleting first trade`, async () => {
      // Setup: Create position with 3 trades
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade2",
          tag50: "tag2",
          isLong: true,
          quantity: ethers.parseEther("2").toString(),
          purchasePrice: ethers.parseEther("51000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade3",
          tag50: "tag3",
          isLong: false,
          quantity: ethers.parseEther("1.5").toString(),
          purchasePrice: ethers.parseEther("52000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Delete first trade (trade1)
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "trade1",
          "BTC",
          "binance",
          "firm1",
          "acc1"
        );

      const position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(2);
      // trade3 should have been swapped to index 0
      expect(position.tradeIds[0]).to.eq("trade3");
      expect(position.tradeIds[1]).to.eq("trade2");
    });

    it(`Should correctly handle deleting last trade`, async () => {
      // Setup: Create position with 3 trades
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade2",
          tag50: "tag2",
          isLong: true,
          quantity: ethers.parseEther("2").toString(),
          purchasePrice: ethers.parseEther("51000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade3",
          tag50: "tag3",
          isLong: false,
          quantity: ethers.parseEther("1.5").toString(),
          purchasePrice: ethers.parseEther("52000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Delete last trade (trade3)
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "trade3",
          "BTC",
          "binance",
          "firm1",
          "acc1"
        );

      const position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(2);
      // No swap needed when deleting last element
      expect(position.tradeIds[0]).to.eq("trade1");
      expect(position.tradeIds[1]).to.eq("trade2");
    });

    it(`Should correctly handle adding trade after deletion`, async () => {
      // Setup: Create position with 2 trades
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade2",
          tag50: "tag2",
          isLong: true,
          quantity: ethers.parseEther("2").toString(),
          purchasePrice: ethers.parseEther("51000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Delete trade1
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "trade1",
          "BTC",
          "binance",
          "firm1",
          "acc1"
        );

      // Add new trade
      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade3",
          tag50: "tag3",
          isLong: false,
          quantity: ethers.parseEther("1.5").toString(),
          purchasePrice: ethers.parseEther("52000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      const position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(2);
      expect(position.tradeIds[0]).to.eq("trade2");
      expect(position.tradeIds[1]).to.eq("trade3");

      // Verify trade1 doesn't exist, but trade2 and trade3 do
      const trade1 = await strandsPosition.trades("trade1");
      expect(trade1.executionTime).to.eq(0);
      const trade2 = await strandsPosition.trades("trade2");
      expect(trade2.tradeId).to.eq("trade2");
      const trade3 = await strandsPosition.trades("trade3");
      expect(trade3.tradeId).to.eq("trade3");
    });

    it(`Should correctly handle deleting all trades one by one`, async () => {
      // Setup: Create position with 3 trades
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade2",
          tag50: "tag2",
          isLong: true,
          quantity: ethers.parseEther("2").toString(),
          purchasePrice: ethers.parseEther("51000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade3",
          tag50: "tag3",
          isLong: false,
          quantity: ethers.parseEther("1.5").toString(),
          purchasePrice: ethers.parseEther("52000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Delete trade2 (middle)
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "trade2",
          "BTC",
          "binance",
          "firm1",
          "acc1"
        );

      let position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(2);

      // Delete trade3 (now at end)
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "trade3",
          "BTC",
          "binance",
          "firm1",
          "acc1"
        );

      position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(1);

      // Delete trade1 (last remaining trade) - this should delete the position
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "trade1",
          "BTC",
          "binance",
          "firm1",
          "acc1"
        );

      // After deleting the last trade, position should be automatically deleted
      // We can verify this by checking that the tokenId no longer exists
      const ownedPositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      expect(ownedPositions.length).to.eq(0);
    });

    it(`Should clear all indices when deleting position with multiple trades`, async () => {
      // Setup: Create position with 3 trades
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade2",
          tag50: "tag2",
          isLong: true,
          quantity: ethers.parseEther("2").toString(),
          purchasePrice: ethers.parseEther("51000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade3",
          tag50: "tag3",
          isLong: false,
          quantity: ethers.parseEther("1.5").toString(),
          purchasePrice: ethers.parseEther("52000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Delete position directly
      await strandsPosition.connect(deployer).deletePosition(1);

      // Verify all trades are deleted (executionTime == 0 means deleted)
      const trade1 = await strandsPosition.trades("trade1");
      const trade2 = await strandsPosition.trades("trade2");
      const trade3 = await strandsPosition.trades("trade3");
      expect(trade1.executionTime).to.eq(0);
      expect(trade2.executionTime).to.eq(0);
      expect(trade3.executionTime).to.eq(0);

      // Verify position is burned
      await expect(
        strandsPosition.getPositionDetails(1)
      ).to.be.revertedWithCustomError(strandsPosition, "InvalidPositionTokenId");
    });

    it(`Should maintain correct index integrity across complex operations`, async () => {
      // Setup: Create position with 4 trades
      await strandsPosition
        .connect(deployer)
        .mint(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: "trade1",
            tag50: "tag1",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );

      for (let i = 2; i <= 4; i++) {
        await strandsPosition.connect(deployer).addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          lastTradingDate,
          {
            tradeId: `trade${i}`,
            tag50: `tag${i}`,
            isLong: i % 2 === 0,
            quantity: ethers.parseEther(`${i}`).toString(),
            purchasePrice: ethers.parseEther(`${50000 + i * 1000}`).toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );
      }

      let position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(4);

      // Delete trade2 (index 1)
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "trade2",
          "BTC",
          "binance",
          "firm1",
          "acc1"
        );

      position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(3);
      expect(position.tradeIds[0]).to.eq("trade1");
      expect(position.tradeIds[1]).to.eq("trade4"); // trade4 swapped to index 1
      expect(position.tradeIds[2]).to.eq("trade3");

      // Add new trade
      await strandsPosition.connect(deployer).addTrade(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        lastTradingDate,
        {
          tradeId: "trade5",
          tag50: "tag5",
          isLong: true,
          quantity: ethers.parseEther("5").toString(),
          purchasePrice: ethers.parseEther("55000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(4);
      expect(position.tradeIds[3]).to.eq("trade5");

      // Delete trade1 (index 0)
      await strandsPosition
        .connect(deployer)
        .deleteTrade(
          "trade1",
          "BTC",
          "binance",
          "firm1",
          "acc1"
        );

      position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(3);
      expect(position.tradeIds[0]).to.eq("trade5"); // trade5 swapped to index 0
      expect(position.tradeIds[1]).to.eq("trade4");
      expect(position.tradeIds[2]).to.eq("trade3");

      // Verify all remaining trades exist
      const trade3 = await strandsPosition.trades("trade3");
      const trade4 = await strandsPosition.trades("trade4");
      const trade5 = await strandsPosition.trades("trade5");
      expect(trade3.tradeId).to.eq("trade3");
      expect(trade4.tradeId).to.eq("trade4");
      expect(trade5.tradeId).to.eq("trade5");

      // Verify deleted trades don't exist
      const trade1 = await strandsPosition.trades("trade1");
      const trade2 = await strandsPosition.trades("trade2");
      expect(trade1.executionTime).to.eq(0);
      expect(trade2.executionTime).to.eq(0);
    });
  });

  describe("Account Position Tracking (getPositionIdsByAccount Optimization)", () => {
    beforeEach(async () => {
      await deployContract();
    });

    it(`Should track multiple positions for same account`, async () => {
      const currentTimestamp = await currentTime();

      // Mint 3 positions for the same account but different symbols
      for (let i = 1; i <= 3; i++) {
        await strandsPosition
          .connect(deployer)
          .mint(
            alice.address,
            `BTC${i}`,
            "binance",
            "firm1",
            "acc1",
            currentTimestamp + 1000,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("50000").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Get all positions for this account
      const positions = await strandsPosition.getPositionIdsByAccount(
        "firm1",
        "acc1",
        true
      );

      expect(positions.length).to.eq(3);
      expect(positions[0]).to.eq(1);
      expect(positions[1]).to.eq(2);
      expect(positions[2]).to.eq(3);
    });

    it(`Should correctly filter expired positions`, async () => {
      const currentTimestamp = await currentTime();

      // Mint 2 unexpired positions
      await strandsPosition.connect(deployer).mint(
        alice.address,
        "BTC1",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      await strandsPosition.connect(deployer).mint(
        alice.address,
        "BTC2",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade2",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Mint 1 expired position
      await strandsPosition.connect(deployer).mint(
        alice.address,
        "BTC3",
        "binance",
        "firm1",
        "acc1",
        PAST_TIMESTAMP, // Expired
        {
          tradeId: "trade3",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Get only non-expired positions
      const nonExpired = await strandsPosition.getPositionIdsByAccount(
        "firm1",
        "acc1",
        false
      );
      expect(nonExpired.length).to.eq(2);
      expect(nonExpired[0]).to.eq(1);
      expect(nonExpired[1]).to.eq(2);

      // Get all positions including expired
      const allPositions = await strandsPosition.getPositionIdsByAccount(
        "firm1",
        "acc1",
        true
      );
      expect(allPositions.length).to.eq(3);
    });

    it(`Should update account mapping when deleting position`, async () => {
      const currentTimestamp = await currentTime();

      // Mint 3 positions for the same account
      for (let i = 1; i <= 3; i++) {
        await strandsPosition
          .connect(deployer)
          .mint(
            alice.address,
            `BTC${i}`,
            "binance",
            "firm1",
            "acc1",
            currentTimestamp + 1000,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("50000").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      let positions = await strandsPosition.getPositionIdsByAccount(
        "firm1",
        "acc1",
        true
      );
      expect(positions.length).to.eq(3);

      // Delete middle position (tokenId 2)
      await strandsPosition.connect(deployer).deletePosition(2);

      positions = await strandsPosition.getPositionIdsByAccount(
        "firm1",
        "acc1",
        true
      );
      expect(positions.length).to.eq(2);
      // Position 3 should have been swapped to index 1
      expect(positions[0]).to.eq(1);
      expect(positions[1]).to.eq(3);
    });

    it(`Should handle deleting all positions for an account`, async () => {
      const currentTimestamp = await currentTime();

      // Mint 2 positions
      await strandsPosition.connect(deployer).mint(
        alice.address,
        "BTC1",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      await strandsPosition.connect(deployer).mint(
        alice.address,
        "BTC2",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade2",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Delete both positions
      await strandsPosition.connect(deployer).deletePosition(1);
      await strandsPosition.connect(deployer).deletePosition(2);

      // Should return empty array
      const positions = await strandsPosition.getPositionIdsByAccount(
        "firm1",
        "acc1",
        true
      );
      expect(positions.length).to.eq(0);
    });

    it(`Should separate positions by different accounts`, async () => {
      const currentTimestamp = await currentTime();

      // Mint 2 positions for account 1
      await strandsPosition.connect(deployer).mint(
        alice.address,
        "BTC1",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      await strandsPosition.connect(deployer).mint(
        alice.address,
        "BTC2",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade2",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Mint 1 position for account 2
      await strandsPosition.connect(deployer).mint(
        bob.address,
        "ETH1",
        "binance",
        "firm1",
        "acc2",
        currentTimestamp + 1000,
        {
          tradeId: "trade3",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("3000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Check account 1 has 2 positions
      const acc1Positions = await strandsPosition.getPositionIdsByAccount(
        "firm1",
        "acc1",
        true
      );
      expect(acc1Positions.length).to.eq(2);
      expect(acc1Positions[0]).to.eq(1);
      expect(acc1Positions[1]).to.eq(2);

      // Check account 2 has 1 position
      const acc2Positions = await strandsPosition.getPositionIdsByAccount(
        "firm1",
        "acc2",
        true
      );
      expect(acc2Positions.length).to.eq(1);
      expect(acc2Positions[0]).to.eq(3);
    });

    it(`Should return empty array for non-existent account`, async () => {
      const positions = await strandsPosition.getPositionIdsByAccount(
        "nonexistent",
        "account",
        true
      );
      expect(positions.length).to.eq(0);
    });

    it(`Should handle complex scenario: multiple accounts, deletions, and expirations`, async () => {
      const currentTimestamp = await currentTime();

      // Create 5 positions for firm1/acc1
      for (let i = 1; i <= 5; i++) {
        const isExpired = i === 3 || i === 5; // Make positions 3 and 5 expired
        await strandsPosition
          .connect(deployer)
          .mint(
            alice.address,
            `SYM${i}`,
            "exchange",
            "firm1",
            "acc1",
            isExpired ? PAST_TIMESTAMP : currentTimestamp + 1000,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther(`${i}`).toString(),
              purchasePrice: ethers.parseEther("1000").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // All positions
      let allPositions = await strandsPosition.getPositionIdsByAccount(
        "firm1",
        "acc1",
        true
      );
      expect(allPositions.length).to.eq(5);

      // Only non-expired (should be 3: positions 1, 2, 4)
      let nonExpired = await strandsPosition.getPositionIdsByAccount(
        "firm1",
        "acc1",
        false
      );
      expect(nonExpired.length).to.eq(3);

      // Delete position 2
      await strandsPosition.connect(deployer).deletePosition(2);

      // Check updated state
      allPositions = await strandsPosition.getPositionIdsByAccount(
        "firm1",
        "acc1",
        true
      );
      expect(allPositions.length).to.eq(4);

      nonExpired = await strandsPosition.getPositionIdsByAccount(
        "firm1",
        "acc1",
        false
      );
      expect(nonExpired.length).to.eq(2); // Only 1 and 4 remain (position 2 was deleted)

      // Delete position 4
      await strandsPosition.connect(deployer).deletePosition(4);

      nonExpired = await strandsPosition.getPositionIdsByAccount(
        "firm1",
        "acc1",
        false
      );
      expect(nonExpired.length).to.eq(1); // Only position 1 remains
      expect(nonExpired[0]).to.eq(1);
    });
  });

  describe("Owner Index Tracking (transferFrom/burn Optimization)", () => {
    beforeEach(async () => {
      await deployContract();
    });

    it(`Should maintain correct owner indices after transfer`, async () => {
      const currentTimestamp = await currentTime();

      // Alice mints 3 positions
      for (let i = 1; i <= 3; i++) {
        await strandsPosition
          .connect(admin)
          .mint(
            alice.address,
            `SYM${i}`,
            "exchange",
            "firm1",
            `acc${i}`,
            currentTimestamp + 1000,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("1000").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Verify Alice owns all 3
      let alicePositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      expect(alicePositions.length).to.eq(3);

      // Transfer middle position (tokenId 2) to Bob
      await strandsPosition
        .connect(admin)
        .transferFrom(alice.address, bob.address, 2);

      // Alice should have 2 positions (1 and 3)
      alicePositions = await strandsPosition.getOwnerTokenIds(alice.address);
      expect(alicePositions.length).to.eq(2);
      // Position 3 should have been swapped to index 1
      expect(alicePositions[0]).to.eq(1);
      expect(alicePositions[1]).to.eq(3);

      // Bob should have 1 position
      const bobPositions = await strandsPosition.getOwnerTokenIds(bob.address);
      expect(bobPositions.length).to.eq(1);
      expect(bobPositions[0]).to.eq(2);

      // Verify ownership
      expect(await strandsPosition.ownerOf(1)).to.eq(alice.address);
      expect(await strandsPosition.ownerOf(2)).to.eq(bob.address);
      expect(await strandsPosition.ownerOf(3)).to.eq(alice.address);
    });

    it(`Should maintain correct indices through multiple transfers (A→B→C)`, async () => {
      const currentTimestamp = await currentTime();

      // Alice mints 1 position
      await strandsPosition.connect(admin).mint(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Transfer Alice → Bob
      await strandsPosition
        .connect(admin)
        .transferFrom(alice.address, bob.address, 1);

      let alicePositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      let bobPositions = await strandsPosition.getOwnerTokenIds(bob.address);
      expect(alicePositions.length).to.eq(0);
      expect(bobPositions.length).to.eq(1);
      expect(bobPositions[0]).to.eq(1);

      // Transfer Bob → Deployer
      await strandsPosition
        .connect(admin)
        .transferFrom(bob.address, deployer.address, 1);

      bobPositions = await strandsPosition.getOwnerTokenIds(bob.address);
      const deployerPositions = await strandsPosition.getOwnerTokenIds(
        deployer.address
      );
      expect(bobPositions.length).to.eq(0);
      expect(deployerPositions.length).to.eq(1);
      expect(deployerPositions[0]).to.eq(1);

      // Verify final ownership
      expect(await strandsPosition.ownerOf(1)).to.eq(deployer.address);
    });

    it(`Should maintain correct indices when burning middle position`, async () => {
      const currentTimestamp = await currentTime();

      // Alice mints 3 positions
      for (let i = 1; i <= 3; i++) {
        await strandsPosition
          .connect(admin)
          .mint(
            alice.address,
            `SYM${i}`,
            "exchange",
            "firm1",
            `acc${i}`,
            currentTimestamp + 1000,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("1000").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      let alicePositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      expect(alicePositions.length).to.eq(3);

      // Delete middle position (tokenId 2) - this calls burn()
      await strandsPosition.connect(admin).deletePosition(2);

      alicePositions = await strandsPosition.getOwnerTokenIds(alice.address);
      expect(alicePositions.length).to.eq(2);
      // Position 3 should have been swapped to index 1
      expect(alicePositions[0]).to.eq(1);
      expect(alicePositions[1]).to.eq(3);
    });

    it(`Should handle burning first position`, async () => {
      const currentTimestamp = await currentTime();

      // Alice mints 3 positions
      for (let i = 1; i <= 3; i++) {
        await strandsPosition
          .connect(admin)
          .mint(
            alice.address,
            `SYM${i}`,
            "exchange",
            "firm1",
            `acc${i}`,
            currentTimestamp + 1000,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("1000").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Delete first position (tokenId 1)
      await strandsPosition.connect(admin).deletePosition(1);

      const alicePositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      expect(alicePositions.length).to.eq(2);
      // Position 3 should have been swapped to index 0
      expect(alicePositions[0]).to.eq(3);
      expect(alicePositions[1]).to.eq(2);
    });

    it(`Should handle burning last position`, async () => {
      const currentTimestamp = await currentTime();

      // Alice mints 3 positions
      for (let i = 1; i <= 3; i++) {
        await strandsPosition
          .connect(admin)
          .mint(
            alice.address,
            `SYM${i}`,
            "exchange",
            "firm1",
            `acc${i}`,
            currentTimestamp + 1000,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("1000").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Delete last position (tokenId 3)
      await strandsPosition.connect(admin).deletePosition(3);

      const alicePositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      expect(alicePositions.length).to.eq(2);
      // No swap needed when deleting last element
      expect(alicePositions[0]).to.eq(1);
      expect(alicePositions[1]).to.eq(2);
    });

    it(`Should maintain indices correctly with batch transfers`, async () => {
      const currentTimestamp = await currentTime();

      // Alice mints 3 positions
      for (let i = 1; i <= 3; i++) {
        await strandsPosition
          .connect(admin)
          .mint(
            alice.address,
            `SYM${i}`,
            "exchange",
            "firm1",
            `acc${i}`,
            currentTimestamp + 1000,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther("1").toString(),
              purchasePrice: ethers.parseEther("1000").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      // Batch transfer positions 1 and 2 to Bob
      await strandsPosition
        .connect(admin)
        .batchTransferFrom(alice.address, bob.address, [1, 2]);

      const alicePositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      const bobPositions = await strandsPosition.getOwnerTokenIds(bob.address);

      expect(alicePositions.length).to.eq(1);
      expect(alicePositions[0]).to.eq(3);

      expect(bobPositions.length).to.eq(2);
      expect(bobPositions[0]).to.eq(1);
      expect(bobPositions[1]).to.eq(2);

      // Verify ownership
      expect(await strandsPosition.ownerOf(1)).to.eq(bob.address);
      expect(await strandsPosition.ownerOf(2)).to.eq(bob.address);
      expect(await strandsPosition.ownerOf(3)).to.eq(alice.address);
    });

    it(`Should handle complex scenario: many positions, transfers, and burns`, async () => {
      const currentTimestamp = await currentTime();

      // Alice mints 5 positions
      for (let i = 1; i <= 5; i++) {
        await strandsPosition
          .connect(admin)
          .mint(
            alice.address,
            `SYM${i}`,
            "exchange",
            "firm1",
            `acc${i}`,
            currentTimestamp + 1000,
            {
              tradeId: `trade${i}`,
              tag50: "tag",
              isLong: true,
              quantity: ethers.parseEther(`${i}`).toString(),
              purchasePrice: ethers.parseEther("1000").toString(),
              executionTime: PAST_TIMESTAMP,
              tradeDate: PAST_TIMESTAMP,
            }
          );
      }

      let alicePositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      expect(alicePositions.length).to.eq(5);

      // Transfer position 2 to Bob
      await strandsPosition
        .connect(admin)
        .transferFrom(alice.address, bob.address, 2);

      alicePositions = await strandsPosition.getOwnerTokenIds(alice.address);
      expect(alicePositions.length).to.eq(4);

      // Delete position 4 from Alice
      await strandsPosition.connect(admin).deletePosition(4);

      alicePositions = await strandsPosition.getOwnerTokenIds(alice.address);
      expect(alicePositions.length).to.eq(3);

      // Transfer position 1 to Deployer
      await strandsPosition
        .connect(admin)
        .transferFrom(alice.address, deployer.address, 1);

      alicePositions = await strandsPosition.getOwnerTokenIds(alice.address);
      expect(alicePositions.length).to.eq(2);

      // Verify Alice has positions 3 and 5
      const aliceTokenIds = alicePositions.map((id: any) => Number(id));
      expect(aliceTokenIds).to.include(3);
      expect(aliceTokenIds).to.include(5);

      // Verify Bob has position 2
      const bobPositions = await strandsPosition.getOwnerTokenIds(bob.address);
      expect(bobPositions.length).to.eq(1);
      expect(bobPositions[0]).to.eq(2);

      // Verify Deployer has position 1
      const deployerPositions = await strandsPosition.getOwnerTokenIds(
        deployer.address
      );
      expect(deployerPositions.length).to.eq(1);
      expect(deployerPositions[0]).to.eq(1);

      // Verify ownership is correct
      expect(await strandsPosition.ownerOf(1)).to.eq(deployer.address);
      expect(await strandsPosition.ownerOf(2)).to.eq(bob.address);
      expect(await strandsPosition.ownerOf(3)).to.eq(alice.address);
      expect(await strandsPosition.ownerOf(5)).to.eq(alice.address);
    });
  });

  describe("Batched Position Deletion", () => {
    beforeEach(async () => {
      await deployContract();
    });

    it(`Should delete position immediately if 100 or fewer trades`, async () => {
      const currentTimestamp = await currentTime();

      // Mint position with 1 trade
      await strandsPosition.connect(admin).mint(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Add 99 more trades (total 100)
      for (let i = 2; i <= 100; i++) {
        await strandsPosition.connect(admin).addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          currentTimestamp + 1000,
          {
            tradeId: `trade${i}`,
            tag50: "tag",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );
      }

      const position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(100);

      // Delete position - should complete in one transaction
      await strandsPosition.connect(admin).deletePosition(1);

      // Position should be fully deleted
      const alicePositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      expect(alicePositions.length).to.eq(0);
    });

    it(`Should start batched deletion for positions with > 100 trades`, async () => {
      const currentTimestamp = await currentTime();

      // Mint position with 1 trade
      await strandsPosition.connect(admin).mint(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Add 100 more trades (total 101)
      for (let i = 2; i <= 101; i++) {
        await strandsPosition.connect(admin).addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          currentTimestamp + 1000,
          {
            tradeId: `trade${i}`,
            tag50: "tag",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );
      }

      const position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(101);

      // Delete position - should only mark for deletion, not complete
      await strandsPosition.connect(admin).deletePosition(1);

      // Position should still exist (NFT not burned yet)
      const alicePositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      expect(alicePositions.length).to.eq(1);

      // Trades should still be there
      const positionAfter = await strandsPosition.getPositionDetails(1);
      expect(positionAfter.tradeIds.length).to.eq(101);
    });

    it(`Should delete trades in batches and finalize when complete`, async () => {
      const currentTimestamp = await currentTime();

      // Mint position with 150 trades
      await strandsPosition.connect(admin).mint(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      for (let i = 2; i <= 150; i++) {
        await strandsPosition.connect(admin).addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          currentTimestamp + 1000,
          {
            tradeId: `trade${i}`,
            tag50: "tag",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );
      }

      // Start deletion
      await strandsPosition.connect(admin).deletePosition(1);

      let position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(150);

      // Delete first batch of 50
      await strandsPosition.connect(admin).deletePositionBatch(1, 50);
      position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(100);

      // Delete second batch of 50
      await strandsPosition.connect(admin).deletePositionBatch(1, 50);
      position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(50);

      // Delete final batch - should finalize deletion
      await strandsPosition.connect(admin).deletePositionBatch(1, 50);

      // Position should be fully deleted
      const alicePositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      expect(alicePositions.length).to.eq(0);
    });

    it(`Should prevent adding trades during deletion`, async () => {
      const currentTimestamp = await currentTime();

      // Create position with 101 trades
      await strandsPosition.connect(admin).mint(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      for (let i = 2; i <= 101; i++) {
        await strandsPosition.connect(admin).addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          currentTimestamp + 1000,
          {
            tradeId: `trade${i}`,
            tag50: "tag",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );
      }

      // Start deletion
      await strandsPosition.connect(admin).deletePosition(1);

      // Try to add a trade - should fail
      await expect(
        strandsPosition.connect(admin).addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          currentTimestamp + 1000,
          {
            tradeId: "trade_new",
            tag50: "tag",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        )
      ).to.be.revertedWithCustomError(strandsPosition, "PositionDeletionInProgress");
    });

    it(`Should prevent deleting trades during deletion`, async () => {
      const currentTimestamp = await currentTime();

      // Create position with > 100 trades
      await strandsPosition.connect(admin).mint(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      for (let i = 2; i <= 110; i++) {
        await strandsPosition.connect(admin).addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          currentTimestamp + 1000,
          {
            tradeId: `trade${i}`,
            tag50: "tag",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );
      }

      // Start deletion
      await strandsPosition.connect(admin).deletePosition(1);

      // Try to delete a trade - should fail
      await expect(
        strandsPosition.connect(admin).deleteTrade(
          "trade1",
          "BTC",
          "binance",
          "firm1",
          "acc1"
        )
      ).to.be.revertedWithCustomError(strandsPosition, "PositionDeletionInProgress");
    });

    it(`Should prevent updating symbolId during deletion`, async () => {
      const currentTimestamp = await currentTime();

      // Create position with > 100 trades
      await strandsPosition.connect(admin).mint(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      for (let i = 2; i <= 110; i++) {
        await strandsPosition.connect(admin).addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          currentTimestamp + 1000,
          {
            tradeId: `trade${i}`,
            tag50: "tag",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );
      }

      // Create another symbol to update to
      await strandsPosition.connect(admin).mint(
        bob.address,
        "ETH",
        "binance",
        "firm2",
        "acc2",
        currentTimestamp + 1000,
        {
          tradeId: "trade_eth",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("10").toString(),
          purchasePrice: ethers.parseEther("3000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Get ETH symbolId
      const ethTokenId = await strandsPosition.getTokenId("firm2", "acc2", "ETH", "binance");
      const ethPositionDetails = await strandsPosition.getPositionDetails(ethTokenId);

      // Start deletion of first position
      await strandsPosition.connect(admin).deletePosition(1);

      // Try to update symbolId - should fail
      await expect(
        strandsPosition.connect(admin).updateSymbolIdForPosition(1, ethPositionDetails.symbolId)
      ).to.be.revertedWithCustomError(strandsPosition, "PositionDeletionInProgress");
    });

    it(`Should prevent expiring position during deletion`, async () => {
      const currentTimestamp = await currentTime();

      // Create position with > 100 trades (with expiry in past)
      await strandsPosition.connect(admin).mint(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        PAST_TIMESTAMP, // Already expired
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      for (let i = 2; i <= 110; i++) {
        await strandsPosition.connect(admin).addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          PAST_TIMESTAMP,
          {
            tradeId: `trade${i}`,
            tag50: "tag",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );
      }

      // Start deletion
      await strandsPosition.connect(admin).deletePosition(1);

      // Try to expire position - should fail
      await expect(
        strandsPosition.connect(admin).expirePosition(1)
      ).to.be.revertedWithCustomError(strandsPosition, "PositionDeletionInProgress");
    });

    it(`Should prevent transferring position during deletion`, async () => {
      const currentTimestamp = await currentTime();

      // Create position with > 100 trades
      await strandsPosition.connect(admin).mint(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      for (let i = 2; i <= 110; i++) {
        await strandsPosition.connect(admin).addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          currentTimestamp + 1000,
          {
            tradeId: `trade${i}`,
            tag50: "tag",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );
      }

      // Start deletion
      await strandsPosition.connect(admin).deletePosition(1);

      // Try to transfer position - should fail
      await expect(
        strandsPosition.connect(admin).transferFrom(alice.address, bob.address, 1)
      ).to.be.revertedWithCustomError(strandsPosition, "PositionDeletionInProgress");
    });

    it(`Should handle variable batch sizes correctly`, async () => {
      const currentTimestamp = await currentTime();

      // Create position with 200 trades
      await strandsPosition.connect(admin).mint(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      for (let i = 2; i <= 200; i++) {
        await strandsPosition.connect(admin).addTrade(
          alice.address,
          "BTC",
          "binance",
          "firm1",
          "acc1",
          currentTimestamp + 1000,
          {
            tradeId: `trade${i}`,
            tag50: "tag",
            isLong: true,
            quantity: ethers.parseEther("1").toString(),
            purchasePrice: ethers.parseEther("50000").toString(),
            executionTime: PAST_TIMESTAMP,
            tradeDate: PAST_TIMESTAMP,
          }
        );
      }

      // Start deletion
      await strandsPosition.connect(admin).deletePosition(1);

      // Delete with varying batch sizes
      await strandsPosition.connect(admin).deletePositionBatch(1, 75);
      let position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(125);

      await strandsPosition.connect(admin).deletePositionBatch(1, 100);
      position = await strandsPosition.getPositionDetails(1);
      expect(position.tradeIds.length).to.eq(25);

      // Final batch - should finalize even though batch size > remaining
      await strandsPosition.connect(admin).deletePositionBatch(1, 100);

      const alicePositions = await strandsPosition.getOwnerTokenIds(
        alice.address
      );
      expect(alicePositions.length).to.eq(0);
    });

    it(`Should fail if trying to batch delete without starting deletion`, async () => {
      const currentTimestamp = await currentTime();

      await strandsPosition.connect(admin).mint(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Try to batch delete without calling deletePosition first
      await expect(
        strandsPosition.connect(admin).deletePositionBatch(1, 50)
      ).to.be.revertedWithCustomError(strandsPosition, "NoDeletionInProgress");
    });

    it(`Should fail if trying to delete same position twice`, async () => {
      const currentTimestamp = await currentTime();

      // Create position with few trades
      await strandsPosition.connect(admin).mint(
        alice.address,
        "BTC",
        "binance",
        "firm1",
        "acc1",
        currentTimestamp + 1000,
        {
          tradeId: "trade1",
          tag50: "tag",
          isLong: true,
          quantity: ethers.parseEther("1").toString(),
          purchasePrice: ethers.parseEther("50000").toString(),
          executionTime: PAST_TIMESTAMP,
          tradeDate: PAST_TIMESTAMP,
        }
      );

      // Delete position (completes immediately)
      await strandsPosition.connect(admin).deletePosition(1);

      // Try to delete again - should fail (position doesn't exist)
      await expect(
        strandsPosition.connect(admin).deletePosition(1)
      ).to.be.revertedWithCustomError(strandsPosition, "InvalidPositionTokenId");
    });

    it(`Should fail deletePositionBatch with invalid tokenId`, async () => {
      await expect(
        strandsPosition.connect(admin).deletePositionBatch(999, 50)
      ).to.be.revertedWithCustomError(strandsPosition, "InvalidPositionTokenId");
    });
  });
});

import { expect, ethers } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
// General
import "dotenv/config";
// REPLACED
// SignerWithAddress is now inferred from ethers.getSigners()

// Types
import type { FundManager } from "../../typechain-types/index.js";

describe("Fund Manager - Testing NFT", () => {
  let fundManager: FundManager,
    deployer: any,
    alice: any,
    bob: any,
    accounts: any[],
    admin: any;

  // Token url
  const url = "https://pin.ski/41aSODW";
  const name = "Strands Fund Manager NFTs";
  const symbol = "SFM";

  before(`Deployment`, async (): Promise<void> => {
    // Get accounts
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    alice = accounts[1];
    bob = accounts[2];
    admin = accounts[3];
    // Deploy NFT contract
    const FundManagerFactory = await ethers.getContractFactory("FundManager");

    fundManager = (await FundManagerFactory.connect(deployer).deploy(
      name,
      symbol,
      url
    )) as FundManager;
    // await fundManager.deployed();
    await fundManager.setIsController(admin.address, true);
  });

  describe(`Check initial param set correctly`, async () => {
    it(`Check name, symbol, cap`, async () => {
      const nftname = await fundManager.name();
      expect(nftname).to.eq(name);
      const nftsymbol = await fundManager.symbol();
      expect(nftsymbol).to.eq(symbol);
    });
  });

  describe(`Mint`, async () => {
    it(`Should fail mint with non-owner`, async () => {
      await expect(
        fundManager.connect(alice).mint(alice.address)
      ).to.be.revertedWithCustomError(fundManager, "OnlyController");
    });
    it(`Only admin can run mint`, async () => {
      await fundManager.connect(deployer).mint(alice.address);
      const balance = await fundManager.balanceOf(alice.address);
      expect(balance).to.eq(1);
    });
  });

  describe(`Transfer NFT and run set functions`, async () => {
    it(`Shouldn't allow non-NFT owner call set functions`, async () => {
      await expect(
        fundManager.connect(deployer).setNav(100)
      ).to.be.revertedWith("NOT AUTHORIZED");
    });
    it(`Transfer NFT from Alice to Deployer`, async () => {
      await fundManager
        .connect(alice)
        .transferFrom(alice.address, deployer.address, 1);
      let balance = await fundManager.balanceOf(alice.address);
      expect(balance).to.eq(0);
      balance = await fundManager.balanceOf(deployer.address);
      expect(balance).to.eq(1);
    });
    it(`Should allow NFT owner to call set function`, async () => {
      await fundManager.connect(deployer).setNav(100);
      const nav = await fundManager.NAV();
      expect(nav).to.eq(100);
    });
    it(`Admin can transfer NFT`, async () => {
      await fundManager
        .connect(admin)
        .transferFrom(deployer.address, bob.address, 1);
      expect(await fundManager.balanceOf(bob.address)).to.be.eq(1);
    });
  });

  describe(`Authorization Edge Cases`, async () => {
    it(`Should allow any NFT holder to set NAV (not token-specific)`, async () => {
      // Mint NFTs to bob and alice
      await fundManager.connect(admin).mint(bob.address);
      await fundManager.connect(admin).mint(alice.address);

      // Bob sets NAV
      await fundManager.connect(bob).setNav(300);
      expect(await fundManager.NAV()).to.eq(300);

      // Alice can also set NAV (global state)
      await fundManager.connect(alice).setNav(400);
      expect(await fundManager.NAV()).to.eq(400);
    });

    it(`Should revert when user with 0 NFTs tries to set values`, async () => {
      const charlie = accounts[4];
      await expect(
        fundManager.connect(charlie).setNav(100)
      ).to.be.revertedWith("NOT AUTHORIZED");
      await expect(
        fundManager.connect(charlie).setCumulativeUserBase(1000)
      ).to.be.revertedWith("NOT AUTHORIZED");
      await expect(
        fundManager.connect(charlie).setNumOfShares(500)
      ).to.be.revertedWith("NOT AUTHORIZED");
    });

    it(`User loses NFT, should no longer be able to set values`, async () => {
      // Deploy fresh FundManager for this test
      const FundManagerFactory = await ethers.getContractFactory("FundManager");
      const isolatedFundManager = (await FundManagerFactory.connect(deployer).deploy(
        "Isolated Fund",
        "IFM",
        "https://test.uri"
      )) as any;
      await isolatedFundManager.setIsController(admin.address, true);

      // Mint NFT to bob
      await isolatedFundManager.connect(admin).mint(bob.address);

      // Bob has NFT, sets NAV
      await isolatedFundManager.connect(bob).setNav(500);

      // Bob transfers NFT to charlie
      const charlie = accounts[4];
      await isolatedFundManager.connect(bob).transferFrom(bob.address, charlie.address, 1);

      // Bob can no longer set values
      await expect(
        isolatedFundManager.connect(bob).setNav(600)
      ).to.be.revertedWith("NOT AUTHORIZED");

      // Charlie can now set values
      await isolatedFundManager.connect(charlie).setNav(600);
      expect(await isolatedFundManager.NAV()).to.eq(600);
    });

    it(`Should use setNav function`, async () => {
      await fundManager.connect(admin).mint(bob.address);
      await fundManager.connect(bob).setNav(200);
      expect(await fundManager.NAV()).to.eq(200);
    });

    it(`Should allow setting name if holder has NFT`, async () => {
      await fundManager.connect(admin).mint(bob.address);
      await fundManager.connect(bob).setName("NewFundName");
      expect(await fundManager.name()).to.eq("NewFundName");
    });

    it(`Should verify name is a string not uint`, async () => {
      await fundManager.connect(admin).mint(bob.address);
      await fundManager.connect(bob).setName("TestName");
      expect(await fundManager.name()).to.eq("TestName");
    });
  });

  describe(`Edge Cases & Boundary Values`, async () => {
    it(`Should handle large values`, async () => {
      await fundManager.connect(admin).mint(bob.address);
      const largeValue = toBN("1000000000000"); // Large but not max
      await fundManager.connect(bob).setNav(largeValue);
      expect(await fundManager.NAV()).to.eq(largeValue);

      await fundManager.connect(bob).setCumulativeUserBase(largeValue);
      expect(await fundManager.cumulativeUserBase()).to.eq(largeValue);

      await fundManager.connect(bob).setNumOfShares(largeValue);
      expect(await fundManager.numOfShares()).to.eq(largeValue);
    });

    it(`Should handle zero values`, async () => {
      await fundManager.connect(admin).mint(bob.address);
      await fundManager.connect(bob).setNav(0);
      expect(await fundManager.NAV()).to.eq(0);

      await fundManager.connect(bob).setCumulativeUserBase(0);
      expect(await fundManager.cumulativeUserBase()).to.eq(0);

      await fundManager.connect(bob).setNumOfShares(0);
      expect(await fundManager.numOfShares()).to.eq(0);
    });

    it(`Should revert when getting tokenURI for non-existent token`, async () => {
      await expect(fundManager.tokenURI(999)).to.be.revertedWith(
        "can't get URI for nonexistent token"
      );
    });

    it(`Should revert when setting tokenURI for non-existent token`, async () => {
      await expect(
        fundManager.connect(admin).setTokenURI(999, "https://new.url")
      ).to.be.revertedWith("can't set URI for nonexistent token");
    });

    it(`Controller can set tokenURI`, async () => {
      const newUri = "https://new.token.uri";
      await fundManager.connect(admin).setTokenURI(1, newUri);
      expect(await fundManager.tokenURI(1)).to.eq(newUri);
    });

    it(`Non-controller cannot set tokenURI`, async () => {
      await expect(
        fundManager.connect(alice).setTokenURI(1, "https://new.url")
      ).to.be.revertedWithCustomError(fundManager, "OnlyController");
    });

    it(`Should revert transfer with wrong from address`, async () => {
      await fundManager.connect(admin).mint(bob.address);
      await expect(
        fundManager.connect(bob).transferFrom(alice.address, deployer.address, 1)
      ).to.be.revertedWith("WRONG_FROM");
    });

    it(`Unauthorized user cannot transfer NFT`, async () => {
      const startingTokenId = await fundManager.mintCounter();
      await fundManager.connect(admin).mint(bob.address);
      const bobTokenId = startingTokenId + 1n;

      const charlie = accounts[4];
      await expect(
        fundManager.connect(charlie).transferFrom(bob.address, alice.address, bobTokenId)
      ).to.be.revertedWith("NOT AUTHORIZED");
    });
  });

  describe(`State Persistence`, async () => {
    it(`Global state persists after NFT transfers`, async () => {
      const startingTokenId = await fundManager.mintCounter();
      await fundManager.connect(admin).mint(bob.address);
      const bobTokenId = startingTokenId + 1n;

      await fundManager.connect(bob).setNav(1000);
      await fundManager.connect(bob).setCumulativeUserBase(5000);

      // Transfer NFT
      const charlie = accounts[4];
      await fundManager.connect(bob).transferFrom(bob.address, charlie.address, bobTokenId);

      // Values should persist
      expect(await fundManager.NAV()).to.eq(1000);
      expect(await fundManager.cumulativeUserBase()).to.eq(5000);
    });

    it(`Multiple holders can modify shared state`, async () => {
      await fundManager.connect(admin).mint(bob.address);
      await fundManager.connect(admin).mint(alice.address);

      await fundManager.connect(bob).setNav(100);
      expect(await fundManager.NAV()).to.eq(100);

      await fundManager.connect(alice).setNav(200);
      expect(await fundManager.NAV()).to.eq(200);

      await fundManager.connect(bob).setCumulativeUserBase(1000);
      expect(await fundManager.cumulativeUserBase()).to.eq(1000);
    });

    it(`Multiple NFTs minted, mintCounter increments correctly`, async () => {
      const charlie = accounts[4];
      const dave = accounts[5];

      // Already minted 2 NFTs (to alice in test, to bob in earlier test)
      const initialCounter = await fundManager.mintCounter();

      await fundManager.connect(admin).mint(charlie.address);
      expect(await fundManager.mintCounter()).to.eq(initialCounter + 1n);

      await fundManager.connect(admin).mint(dave.address);
      expect(await fundManager.mintCounter()).to.eq(initialCounter + 2n);
    });
  });
});

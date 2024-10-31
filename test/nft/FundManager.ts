// General
import "dotenv/config";
const { expect } = require("chai");
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

// Types
import { FundManager } from "../../typechain-types";

describe("Fund Manager - Testing NFT", () => {
  let fundManager: FundManager,
    deployer: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    accounts: SignerWithAddress[],
    admin: SignerWithAddress;

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
        fundManager.connect(deployer).setNAV(100)
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
      await fundManager.connect(deployer).setNAV(100);
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
});

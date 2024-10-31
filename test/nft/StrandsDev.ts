// General
import "dotenv/config";
const { expect } = require("chai");
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

// Types
import { StrandsDev } from "../../typechain-types";

describe("StrandsDev - Testing NFT", () => {
  let StrandsDev: StrandsDev,
    deployer: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    accounts: SignerWithAddress[];

  // Token url
  const url = "https://pin.ski/41aSODW";
  const name = "Strads Dev";
  const symbol = "SD";

  before(`Deployment`, async (): Promise<void> => {
    // Get accounts
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    alice = accounts[1];
    bob = accounts[2];
    // Deploy NFT contract
    const ThemeNFTFactory = await ethers.getContractFactory("StrandsDev");

    StrandsDev = (await ThemeNFTFactory.connect(deployer).deploy(
      name,
      symbol,
      url
    )) as StrandsDev;
    // await StrandsDev.deployed();
  });

  it(`Check name, symbol, cap`, async () => {
    const nftname = await StrandsDev.name();
    expect(nftname).to.eq(name);
    const nftsymbol = await StrandsDev.symbol();
    expect(nftsymbol).to.eq(symbol);
  });

  it(`Admin can mint NFT`, async () => {
    await StrandsDev.mint(alice.address);
    const balance = await StrandsDev.balanceOf(alice.address);
    expect(balance).to.eq(1);
  });

  it(`Non admin cant mint NFT`, async () => {
    await expect(
      StrandsDev.connect(alice).mint(alice.address)
    ).to.be.revertedWithCustomError(StrandsDev, "OnlyController");
  });

  it(`Non nft owner cant transfer NFT`, async () => {
    await expect(
      StrandsDev.connect(bob).transferFrom(alice.address, bob.address, 1)
    ).to.be.revertedWith("NOT_AUTHORIZED");
  });

  it(`NFT owner can transfer NFT`, async () => {
    await StrandsDev.connect(alice).transferFrom(alice.address, bob.address, 1);
    const balance = await StrandsDev.balanceOf(bob.address);
    expect(balance).to.eq(1);
  });
});

// General
import "dotenv/config";
const { expect } = require("chai");
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

// Types
import { S1Position } from "../../typechain-types";

describe("S1Position - Testing NFT", () => {
  let S1Position: S1Position,
    deployer: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    admin: SignerWithAddress,
    accounts: SignerWithAddress[];

  // Token url
  const url = "https://pin.ski/41aSODW";
  const name = "Strands S1 Positon NFT";
  const symbol = "SS1P";

  before(`Deployment`, async (): Promise<void> => {
    // Get accounts
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    alice = accounts[1];
    bob = accounts[2];
    admin = accounts[3];
    // Deploy NFT contract
    const ThemeNFTFactory = await ethers.getContractFactory("S1Position");

    S1Position = (await ThemeNFTFactory.connect(deployer).deploy(
      name,
      symbol,
      url
    )) as S1Position;
    // await S1Position.deployed();
    await S1Position.setIsController(admin.address, true);
  });

  it(`Check name, symbol, cap`, async () => {
    const nftname = await S1Position.name();
    expect(nftname).to.eq(name);
    const nftsymbol = await S1Position.symbol();
    expect(nftsymbol).to.eq(symbol);
  });

  it(`Admin can mint NFT`, async () => {
    await S1Position.mint(alice.address, 1);
    const balance = await S1Position.balanceOf(alice.address);
    expect(balance).to.eq(1);
  });

  it(`Non admin cant mint NFT`, async () => {
    await expect(
      S1Position.connect(alice).mint(alice.address, 1)
    ).to.be.revertedWithCustomError(S1Position, "OnlyController");
  });

  it(`Non nft owner cant transfer NFT`, async () => {
    await expect(
      S1Position.connect(bob).transferFrom(alice.address, bob.address, 1)
    ).to.be.revertedWith("NOT AUTHORIZED");
  });

  it(`NFT owner can transfer NFT`, async () => {
    await S1Position.connect(alice).transferFrom(alice.address, bob.address, 1);
    const balance = await S1Position.balanceOf(bob.address);
    expect(balance).to.eq(1);
  });
});

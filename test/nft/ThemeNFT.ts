// General
import "dotenv/config";
const { expect } = require("chai");
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

// Types
import { StrandsTheme } from "../../typechain-types";

describe("StrandsTheme - Testing NFT", () => {
  let StrandsTheme: StrandsTheme,
    deployer: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    accounts: SignerWithAddress[];

  // Token url
  const url = "https://pin.ski/41aSODW";
  const name = "Strands Theme NFT";
  const symbol = "ST";

  before(`Deployment`, async (): Promise<void> => {
    // Get accounts
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    alice = accounts[1];
    bob = accounts[2];
    // Deploy NFT contract
    const ThemeNFTFactory = await ethers.getContractFactory("StrandsTheme");

    StrandsTheme = (await ThemeNFTFactory.connect(deployer).deploy(
      name,
      symbol,
      url
    )) as StrandsTheme;
  });

  it(`Check name, symbol, cap`, async () => {
    const nftname = await StrandsTheme.name();
    expect(nftname).to.eq(name);
    const nftsymbol = await StrandsTheme.symbol();
    expect(nftsymbol).to.eq(symbol);
  });

  it(`Mint`, async () => {
    await StrandsTheme.mint(alice.address, "testTheme1");
    const balance = await StrandsTheme.balanceOf(alice.address);
    expect(balance).to.eq(1);
    const themeName = await StrandsTheme.getThemeName(1);
    expect(themeName).to.eq("testTheme1");
  });

  it(`Non admin can't mint`, async () => {
    await expect(
      StrandsTheme.connect(alice).mint(alice.address, "testTheme1")
    ).to.be.revertedWithCustomError(StrandsTheme, "OnlyController");
  });

  it(`Set field & Get field`, async () => {
    await StrandsTheme.connect(alice).set(
      1,
      ethers.encodeBytes32String("backgroundOpacity"),
      ethers.encodeBytes32String("100")
    );
    const value = await StrandsTheme.get(
      1,
      ethers.encodeBytes32String("backgroundOpacity")
    );
    expect(ethers.decodeBytes32String(value)).to.equal("100");
  });

  it(`Only nftOwner can set field`, async () => {
    await expect(
      StrandsTheme.connect(bob).set(
        1,
        ethers.encodeBytes32String("backgroundOpacity"),
        ethers.encodeBytes32String("100")
      )
    ).to.be.revertedWith("No Permission");
  });

  it(`Check fields`, async () => {
    const [fieldNames, fieldValues] = await StrandsTheme.getAllFields(1);
    expect(ethers.decodeBytes32String(fieldNames[0])).to.equal(
      "backgroundOpacity"
    );
    expect(ethers.decodeBytes32String(fieldValues[0])).to.equal("100");
  });

  it(`Owned Token Ids`, async () => {
    await StrandsTheme.mint(alice.address, "testTheme2");
    let tokenIds = await StrandsTheme.getOwnerTokens(alice.address);
    expect(tokenIds.length).to.eq(2);
    await StrandsTheme.connect(alice).transferFrom(
      alice.address,
      bob.address,
      1
    );
    tokenIds = await StrandsTheme.getOwnerTokens(alice.address);
    expect(tokenIds.length).to.eq(1);
    const bobTokenIds = await StrandsTheme.getOwnerTokens(bob.address);
    expect(bobTokenIds.length).to.eq(1);
    expect(bobTokenIds[0]).to.eq(1);
  });
});

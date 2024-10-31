// General
import "dotenv/config";
const { expect } = require("chai");
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

// Types
import { TestERC20SetDecimals, Strands250 } from "../../typechain-types";
import { parseEther } from "ethers";

describe("Strands250 - Testing NFT", () => {
  let Strands250: Strands250,
    deployer: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    accounts: SignerWithAddress[],
    admin: SignerWithAddress,
    FeeToken: TestERC20SetDecimals;

  // Token url
  const url = "https://pin.ski/41aSODW";
  const name = "Strands First 250 NFT";
  const symbol = "SF250";
  const cap = 5;
  before(`Deployment`, async (): Promise<void> => {
    // Get accounts
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    alice = accounts[1];
    bob = accounts[2];
    admin = accounts[3];

    // Deploy Fee Token
    const FeeTokenFactory = await ethers.getContractFactory("TestERC20SetDecimals");

    FeeToken = (await FeeTokenFactory.connect(deployer).deploy(
      "Test Token",
      "TT",
      18
    )) as TestERC20SetDecimals;
    // Deploy NFT contract
    const Strands250Factory = await ethers.getContractFactory("Strands250");

    Strands250 = (await Strands250Factory.connect(deployer).deploy(
      name,
      symbol,
      cap,
      url
    )) as Strands250;
    // await Strands250.deployed();

    await Strands250.setIsController(admin.address, true);
    await Strands250.setFeeToken(await FeeToken.getAddress());
    await Strands250.setFeeRecipient(await admin.getAddress());
    await Strands250.setFeeAmount(parseEther("0.1"));
  });

  it(`Check name, symbol, cap`, async () => {
    const nftname = await Strands250.name();
    expect(nftname).to.eq(name);
    const nftsymbol = await Strands250.symbol();
    expect(nftsymbol).to.eq(symbol);
  });

  it(`Admin can adminSelfBatchMint NFT`, async () => {
    await Strands250.adminSelfBatchMint(1);
    const balance = await Strands250.balanceOf(deployer.address);
    expect(balance).to.eq(1);
  });

  it(`Non admin cant adminSelfBatchMint NFT`, async () => {
    await expect(
      Strands250.connect(alice).adminSelfBatchMint(1)
    ).to.be.revertedWithCustomError(Strands250, "OnlyController");
  });

  it(`Non nft owner cant transfer NFT`, async () => {
    await expect(
      Strands250.connect(bob).transferFrom(deployer.address, bob.address, 1)
    ).to.be.revertedWith("NOT_AUTHORIZED");
  });

  it(`NFT owner can transfer NFT`, async () => {
    await Strands250.connect(deployer).transferFrom(
      deployer.address,
      bob.address,
      1
    );
    const balance = await Strands250.balanceOf(bob.address);
    expect(balance).to.eq(1);
  });

  it(`Admin can transfer NFT`, async () => {
    await Strands250.connect(admin).transferFrom(bob.address, alice.address, 1);
    expect(await Strands250.balanceOf(alice.address)).to.eq(1);
  });

  it(`SafeTransferFrom also took the fee`, async () => {
    await FeeToken.mint(alice.address, parseEther("1000"));
    await FeeToken.connect(alice).approve(
      await Strands250.getAddress(),
      parseEther("0.1")
    );
    await Strands250.connect(alice).safeTransferFrom(
      alice.address,
      bob.address,
      1
    );
    expect(await Strands250.balanceOf(bob.address)).to.eq(1);
    expect(await FeeToken.balanceOf(admin.address)).to.be.eq(parseEther("0.1"));
  });
});

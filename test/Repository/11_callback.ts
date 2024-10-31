import { MaxInt256, MaxUint256 } from "ethers/constants";
import { seedFixture } from "../../scripts/utils/fixture";
import { hre } from "../../scripts/utils/testSetup";
import { toBN } from "../../scripts/utils/web3utils";
import { Mock } from "node:test";
import { ethers as ethersNonHardhat } from "ethers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers";

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Repository Callback - Testing using (CallBackGateKeeper)", function () {
  beforeEach(() => seedFixture({ useCallBackGateKeeper: true }));

  describe("testing that callback does not function as base state", function () {
    it("bool is false and whitelist is empty", async () => {
      // Check initial state
      const isCallbackEnabled = await hre.f.SC.repositoryContracts[0].repository.isCallbackEnabled();
      expect(isCallbackEnabled).to.be.false;

      if ('getCallbackContractForAddress' in hre.f.SC.gateKeeper) {
        const whitelist = await hre.f.SC.gateKeeper.getCallbackContractForAddress(hre.f.SC.userAccount.address);
        expect(whitelist.isWhitelisted).to.be.false;
      } else {
        throw new Error("GateKeeper is not of type CallBackGateKeeper");
      }
    });
  });

  describe("Standard base case for deposit and withdraw with new gateKeeper", function () {
    it("should deposit, process the deposit, and then withdraw the correct amount - with new gatekeeper", async function () {
      const amount = ethers.parseUnits("50000", 6); // 50,000 USDC
      const minOut = toBN("1", 6);

      // Deposit tokens
      await hre.f.SC.MockUSDC.connect(hre.f.SC.userAccount).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateDeposit(amount, ethers.parseUnits('40000', 6)); // min out is 50,000 USDC

      // Process the deposit
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // Check that the correct repository tokens have been minted
      const tokenValue = await hre.f.SC.repositoryContracts[0].repository.getNAV();
      const estimateValue = (toBN("100") / tokenValue) * toBN("1");

      expect(
        await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(
          hre.f.SC.userAccount.address
        )
      ).to.be.closeTo(estimateValue, toBN("100000")); // 100k tokens for depositing 100k USDC

      // Withdraw tokens
      const numLpTokens = await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(hre.f.SC.userAccount.address);

      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.SC.userAccount)
        .approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),
          numLpTokens
        );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateWithdraw(numLpTokens, 0);

      // Process the withdrawal
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.userAccount).redeemClaimable();

      // Check that the correct amount is owned by the user
      const finalBalance = await hre.f.SC.MockUSDC.balanceOf(hre.f.SC.userAccount.address);
      expect(finalBalance).to.be.closeTo(amount, toBN("1"));
    });
  });

  describe("Enabling callBack and adding user to whitelist", function () {
    it("should enable callback and add user to whitelist", async () => {

      // going to deploy a contract to local scope for testing, NOT best practice
      const MockCallBackContract = await (await ethers.getContractFactory("MockCallBackContract")).connect(hre.f.SC.userAccount).deploy(
        await hre.f.SC.repositoryContracts[0].repository.getAddress()
      ) as MockCallBackContract;

      // check initial state is callback is disabled
      const isEnabled = await hre.f.SC.repositoryContracts[0].repository.isCallbackEnabled();
      expect(isEnabled).to.be.false;

      // check if user is not whitelisted
      const whitelistre = await (hre.f.SC.gateKeeper as CallBackGateKeeper).getCallbackContractForAddress(await hre.f.SC.userAccount.getAddress());

      expect(whitelistre.isWhitelisted).to.be.false;
      expect(whitelistre.contractAddress).to.be.eq(ethersNonHardhat.ZeroAddress);

      // Enable callback
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setCallbackEnabled(true);

      const isCallbackEnabled = await hre.f.SC.repositoryContracts[0].repository.isCallbackEnabled();
      expect(isCallbackEnabled).to.be.true;

      // Add user to whitelist
      await (hre.f.SC.gateKeeper as CallBackGateKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setWhiteListedContractForAddress(await hre.f.SC.userAccount.getAddress(), await MockCallBackContract.getAddress(), true);


      const whitelist = await (hre.f.SC.gateKeeper as CallBackGateKeeper).getCallbackContractForAddress(await hre.f.SC.userAccount.getAddress());
      expect(whitelist.isWhitelisted).to.be.true;

      // process with callback enabled.
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);
    });

    it("should make a callback to the contract", async () => {
      const amount = ethers.parseUnits("50000", 6); // 50,000 USDC

      // Deploy MockCallBackContract
      const MockCallBackContract = await (await ethers.getContractFactory("MockCallBackContract"))
        .connect(hre.f.SC.userAccount)
        .deploy(await hre.f.SC.repositoryContracts[0].repository.getAddress()) as MockCallBackContract;

      // Enable callback and whitelist the contract
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setCallbackEnabled(true);

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).setGasLimit(toBN("40000"));

      await (hre.f.SC.gateKeeper as CallBackGateKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setWhiteListedContractForAddress(await hre.f.SC.userAccount, await MockCallBackContract.getAddress(), true);

      // Deposit tokens
      await hre.f.SC.MockUSDC.connect(hre.f.SC.userAccount).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateDeposit(amount, ethers.parseUnits('40000', 6));

      // Process the deposit
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      // Check that the deposit callback was called
      const depositCalled = await MockCallBackContract.depositCalled();
      expect(depositCalled).to.be.true;

      // Withdraw tokens
      const numLpTokens = await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(hre.f.SC.userAccount.address);

      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.SC.userAccount)
        .approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),
          numLpTokens
        );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateWithdraw(numLpTokens, 0);

      // Process the withdrawal
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);

      // Check that the withdrawal callback was called
      const withdrawalCalled = await MockCallBackContract.withdrawalCalled();
      expect(withdrawalCalled).to.be.true;

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.userAccount).redeemClaimable();

      const claimable = await await MockCallBackContract.claimCalled();
      expect(claimable).to.be.true;
    });
  });

  describe("Failure Testing - using same CallBack gateKeeper", function () {
    it('Can set MockFailure Callback Contract (no revert)', async () => {
      // deploy MockFailureCallBackContract
      const MockFailureCallBackContract = await (await ethers.getContractFactory("MockCallBackFailure"))
        .connect(hre.f.SC.userAccount)
        .deploy() as MockCallBackFailure;

      // set callback to the contract
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setCallbackEnabled(false);


      await (hre.f.SC.gateKeeper as CallBackGateKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setWhiteListedContractForAddress(await hre.f.SC.userAccount, await MockFailureCallBackContract.getAddress(), true);

      // make a deposit
      const amount = ethers.parseUnits("50000", 6); // 50,000 USDC

      await hre.f.SC.MockUSDC.connect(hre.f.SC.userAccount).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateDeposit(amount, ethers.parseUnits('40000', 6));

      // just process normally
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.userAccount).initiateWithdraw(toBN("50000"), 0);

      // try withdraw
      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).processWithdrawals(1);


      // try redeem
      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.userAccount).redeemClaimable();
    });

    it('enable call back and make sure that the try catch emits an event on failure (revert)', async () => {
      const amount = ethers.parseUnits("50000", 6); // 50,000 USDC

      // Deploy MockFailureCallBackContract
      const MockFailureCallBackContract = await (await ethers.getContractFactory("MockCallBackFailure"))
        .connect(hre.f.SC.userAccount)
        .deploy() as MockCallBackFailure;

      // Enable callback and whitelist the failure contract
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setCallbackEnabled(true);

      await (hre.f.SC.gateKeeper as CallBackGateKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setWhiteListedContractForAddress(await hre.f.SC.userAccount.getAddress(), await MockFailureCallBackContract.getAddress(), true);

      // Deposit tokens
      await hre.f.SC.MockUSDC.connect(hre.f.SC.userAccount).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateDeposit(amount, ethers.parseUnits('40000', 6));

      // Process the deposit and expect the CallBackResulted event
      const logsProcessDeposit = (await (await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1)).wait())?.logs;

      // Parse logs to find CallBackResulted event
      const callBackResultedEvent = logsProcessDeposit.find(log => log.fragment && log.fragment.name === 'CallBackResulted');

      expect(callBackResultedEvent.args[5]).to.be.false;

      // Withdraw tokens
      const numLpTokens = await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(hre.f.SC.userAccount.address);

      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.SC.userAccount)
        .approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),
          numLpTokens
        );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateWithdraw(numLpTokens, 0);

      // Process the withdrawal and expect the CallBackResulted event

      const withdrawals = await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);

      const logsProcessWithdrawals = (await withdrawals.wait())?.logs;

      // Parse logs to find CallBackResulted event
      const callBackResultedEventWithdraw = logsProcessWithdrawals.find(log => log.fragment && log.fragment.name === 'CallBackResulted');
      expect(callBackResultedEventWithdraw?.args[5]).to.be.false;

      // // Try to redeem claimable and expect the CallBackResulted event

      const redeemableRes = await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .redeemClaimable()

      const logsRedeemClaimable = (await redeemableRes.wait())?.logs;
      // Parse logs to find CallBackResulted event
      const callBackResultedEventRedeem = logsRedeemClaimable.find(log => log.fragment && log.fragment.name === 'CallBackResulted');
      expect(callBackResultedEventRedeem?.args[5]).to.be.false;
    });

    it('should still emit CallBackResulted events but the result should be true when using MockCallBackContract', async () => {
      const amount = ethers.parseUnits("50000", 6); // 50,000 USDC

      // Deploy MockCallBackContract
      const MockCallBackContract = await (await ethers.getContractFactory("MockCallBackContract"))
        .connect(hre.f.SC.userAccount)
        .deploy(await hre.f.SC.repositoryContracts[0].repository.getAddress()) as MockCallBackContract;

      // Enable callback and whitelist the contract
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setCallbackEnabled(true);

      // set gas limit
      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).setGasLimit(toBN("40000"));

      await (hre.f.SC.gateKeeper as CallBackGateKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setWhiteListedContractForAddress(await hre.f.SC.userAccount.getAddress(), await MockCallBackContract.getAddress(), true);

      // Deposit tokens
      await hre.f.SC.MockUSDC.connect(hre.f.SC.userAccount).approve(
        hre.f.SC.repositoryContracts[0].repository.getAddress(),
        amount
      );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateDeposit(amount, ethers.parseUnits('40000', 6));

      // Process the deposit and check the CallBackResulted event
      const depositTx = await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);
      const depositReceipt = await depositTx.wait();
      const depositEvent = depositReceipt.logs.find(log => log.fragment && log.fragment.name === 'CallBackResulted');
      expect(depositEvent?.args[5]).to.be.true;

      // Withdraw tokens
      const numLpTokens = await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(hre.f.SC.userAccount.address);

      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(hre.f.SC.userAccount)
        .approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),
          numLpTokens
        );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .initiateWithdraw(numLpTokens, 0);

      // Process the withdrawal and check the CallBackResulted event
      const withdrawalTx = await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processWithdrawals(1);
      const withdrawalReceipt = await withdrawalTx.wait();
      const withdrawalEvent = withdrawalReceipt.logs.find(log => log.fragment && log.fragment.name === 'CallBackResulted');
      expect(withdrawalEvent?.args[5]).to.be.true;

      // Try to redeem claimable and check the CallBackResulted event
      const redeemTx = await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.userAccount)
        .redeemClaimable();
      const redeemReceipt = await redeemTx.wait();
      const redeemEvent = redeemReceipt.logs.find(log => log.fragment && log.fragment.name === 'CallBackResulted');
      expect(redeemEvent?.args[5]).to.be.true;
    });
  });
});
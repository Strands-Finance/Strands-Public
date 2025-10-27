import { MaxUint256 } from "ethers/constants";
import { hre, expect, ethers, loadFixture, createFixture, approveAndDeposit, approveAndWithdraw, getAlice, getBob } from "../helpers/setupTestSystem.js";
import { toBN } from "../helpers/testUtils.js";
import { ethers as ethersNonHardhat } from "ethers";

describe(`Repository Callback - Testing using (accountNFTBookKeeper + callbackGateKeeper)`, function () {
  let alice: any;
  let bob: any;

  const deployContractsFixture = createFixture(
    'accountNFT',
    'callback',
    'USDC',
    true,
    0,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);
    alice = getAlice();
    bob = getBob();
  });

  describe("testing that callback does not function as base state", function () {
    it("bool is false and whitelist is empty", async () => {
      // Check initial state
      const isCallbackEnabled = await hre.f.SC.repositoryContracts[0].repository.isCallbackEnabled();
      expect(isCallbackEnabled).to.be.false;

      // Check if the gatekeeper is of type CallBackGateKeeper
      if ('getCallbackContractForAddress' in hre.f.SC.gateKeeper) {
        const whitelist = await hre.f.SC.gateKeeper.getCallbackContractForAddress(bob.address);
        expect(whitelist.isWhitelisted).to.be.false;
      } else {
        throw new Error("GateKeeper is not of type CallBackGateKeeper");
      }
    });
  });

  describe("Standard base case for deposit and withdraw with new gateKeeper", function () {
    it("should deposit, process the deposit, and then withdraw the correct amount - with new gatekeeper", async function () {
      const amount = toBN("50000", 6);       const beginBalance = await hre.f.SC.MockUSDC.balanceOf(bob.address);

      // Deposit tokens
      await approveAndDeposit(bob, amount, true, 'USDC');

      // Check that the correct repository tokens have been minted
      const NAV = await hre.f.SC.repositoryContracts[0].repository.getNAV();
      expect(NAV).to.be.eq(toBN("1"));

      // Withdraw tokens
      const numLpTokens = await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(bob.address);

      expect(numLpTokens).to.be.eq(toBN("50000")); // 50k tokens for depositing 50k USDC

      await approveAndWithdraw(bob, numLpTokens, true, 0);

      await hre.f.SC.repositoryContracts[0].repository.connect(bob).redeemClaimable();

      // Check that the correct amount is owned by the user
      const finalBalance = await hre.f.SC.MockUSDC.balanceOf(bob.address);
      expect(finalBalance).to.be.eq(beginBalance);
    });
  });

  describe("Enabling callBack and adding user to whitelist", function () {
    it("should enable callback and add user to whitelist", async () => {

      // going to deploy a contract to local scope for testing, NOT best practice
      const MockCallBackContract = await (await ethers.getContractFactory("MockCallBackContract")).connect(bob).deploy(
        await hre.f.SC.repositoryContracts[0].repository.getAddress()
      ) as MockCallBackContract;

      // check initial state is callback is disabled
      const isEnabled = await hre.f.SC.repositoryContracts[0].repository.isCallbackEnabled();
      expect(isEnabled).to.be.false;

      // check if user is not whitelisted
      const whitelistre = await (hre.f.SC.gateKeeper as CallBackGateKeeper).getCallbackContractForAddress(await bob.getAddress());

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
        .setWhiteListedContractForAddress(await bob.getAddress(), await MockCallBackContract.getAddress(), true);

      const whitelist = await (hre.f.SC.gateKeeper as CallBackGateKeeper).getCallbackContractForAddress(await bob.getAddress());
      expect(whitelist.isWhitelisted).to.be.true;

      // process with callback enabled.
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);
    });

    it("should make a callback to the contract", async () => {
      const amount = toBN("50000", 6); 
      // Deploy MockCallBackContract
      const MockCallBackContract = await (await ethers.getContractFactory("MockCallBackContract"))
        .connect(bob)
        .deploy(await hre.f.SC.repositoryContracts[0].repository.getAddress()) as MockCallBackContract;

      // Enable callback and whitelist the contract
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setCallbackEnabled(true);

      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).setGasLimit(toBN("40000"));

      await (hre.f.SC.gateKeeper as CallBackGateKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setWhiteListedContractForAddress(await bob, await MockCallBackContract.getAddress(), true);

      // Deposit tokens
      await approveAndDeposit(bob, amount, true, 'USDC');

      // Check that the deposit callback was called
      const depositCalled = await MockCallBackContract.depositCalled();
      expect(depositCalled).to.be.true;

      // Withdraw tokens
      const numLpTokens = await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(bob.address);

      await approveAndWithdraw(bob, numLpTokens, true, 0);

      // Check that the withdrawal callback was called
      const withdrawalCalled = await MockCallBackContract.withdrawalCalled();
      expect(withdrawalCalled).to.be.true;

      await hre.f.SC.repositoryContracts[0].repository.connect(bob).redeemClaimable();

      const claimable = await MockCallBackContract.claimCalled();
      expect(claimable).to.be.true;
    });
  });

  describe("Failure Testing - using same CallBack gateKeeper", function () {
    it('Can set MockFailure Callback Contract (no revert)', async () => {
      // deploy MockFailureCallBackContract
      const MockFailureCallBackContract = await (await ethers.getContractFactory("MockCallBackFailure"))
        .connect(bob)
        .deploy() as MockCallBackFailure;

      // set callback to the contract
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setCallbackEnabled(false);


      await (hre.f.SC.gateKeeper as CallBackGateKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setWhiteListedContractForAddress(await bob, await MockFailureCallBackContract.getAddress(), true);

      // make a deposit
      const amount = toBN("50000", 6); 
      await approveAndDeposit(bob, amount, true, 'USDC');

      await hre.f.SC.repositoryContracts[0].repository.connect(bob).initiateWithdraw(toBN("50000"), 0);

      // try withdraw
      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).processWithdrawals(1);


      // try redeem
      await hre.f.SC.repositoryContracts[0].repository.connect(bob).redeemClaimable();
    });

    it('enable call back and make sure that the try catch emits an event on failure (revert)', async () => {
      const amount = toBN("50000", 6); 
      // Deploy MockFailureCallBackContract
      const MockFailureCallBackContract = await (await ethers.getContractFactory("MockCallBackFailure"))
        .connect(bob)
        .deploy() as MockCallBackFailure;

      // Enable callback and whitelist the failure contract
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setCallbackEnabled(true);

      await (hre.f.SC.gateKeeper as CallBackGateKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setWhiteListedContractForAddress(await bob.getAddress(), await MockFailureCallBackContract.getAddress(), true);

      await approveAndDeposit(bob,amount)

      // Process the deposit and expect the CallBackResulted event
      const logsProcessDeposit = (await (await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1)).wait())?.logs;

      // Parse logs to find CallBackResulted event
      const callBackResultedEvent = logsProcessDeposit.find(log => log.fragment && log.fragment.name === 'CallBackResulted');

      expect(callBackResultedEvent.args[5]).to.be.false;

      // Withdraw tokens
      const numLpTokens = await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(bob.address);

      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(bob)
        .approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),
          numLpTokens
        );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(bob)
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
        .connect(bob)
        .redeemClaimable()

      const logsRedeemClaimable = (await redeemableRes.wait())?.logs;
      // Parse logs to find CallBackResulted event
      const callBackResultedEventRedeem = logsRedeemClaimable.find(log => log.fragment && log.fragment.name === 'CallBackResulted');
      expect(callBackResultedEventRedeem?.args[5]).to.be.false;
    });

    it('should still emit CallBackResulted events but the result should be true when using MockCallBackContract', async () => {
      const amount = toBN("50000", 6); 
      // Deploy MockCallBackContract
      const MockCallBackContract = await (await ethers.getContractFactory("MockCallBackContract"))
        .connect(bob)
        .deploy(await hre.f.SC.repositoryContracts[0].repository.getAddress()) as MockCallBackContract;

      // Enable callback and whitelist the contract
      await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setCallbackEnabled(true);

      // set gas limit
      await hre.f.SC.repositoryContracts[0].repository.connect(hre.f.SC.repositoryContracts[0].controller).setGasLimit(toBN("40000"));

      await (hre.f.SC.gateKeeper as CallBackGateKeeper)
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .setWhiteListedContractForAddress(await bob.getAddress(), await MockCallBackContract.getAddress(), true);

      await approveAndDeposit(bob,amount)

      // Process the deposit and check the CallBackResulted event
      const depositTx = await hre.f.SC.repositoryContracts[0].repository
        .connect(hre.f.SC.repositoryContracts[0].controller)
        .processDeposits(1);
      const depositReceipt = await depositTx.wait();
      const depositEvent = depositReceipt.logs.find(log => log.fragment && log.fragment.name === 'CallBackResulted');
      expect(depositEvent?.args[5]).to.be.true;

      // Withdraw tokens
      const numLpTokens = await hre.f.SC.repositoryContracts[0].repositoryToken.balanceOf(bob.address);

      await hre.f.SC.repositoryContracts[0].repositoryToken
        .connect(bob)
        .approve(
          hre.f.SC.repositoryContracts[0].repository.getAddress(),
          numLpTokens
        );

      await hre.f.SC.repositoryContracts[0].repository
        .connect(bob)
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
        .connect(bob)
        .redeemClaimable();
      const redeemReceipt = await redeemTx.wait();
      const redeemEvent = redeemReceipt.logs.find(log => log.fragment && log.fragment.name === 'CallBackResulted');
      expect(redeemEvent?.args[5]).to.be.true;
    });
  });
});
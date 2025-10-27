import { hre, expect, ethers, loadFixture, createFixture, getAlice, getBob, approveAndDeposit } from "../helpers/setupTestSystem.js";
import { toBN, fromBN } from "../helpers/testUtils.js";
import {
  fastForward,
  restoreSnapshot,
  takeSnapshot,
} from "../helpers/evm.js";
import { parseUnits } from "ethers";
import type { Repository, RepositoryToken, TestERC20SetDecimals } from "../../typechain-types/index.js";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe(`SimpleBookKeeper with StrandsAPI`, function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  // Contract shortcuts for better readability
  let repo: Repository;
  let repoToken: RepositoryToken;
  let strandsAPI: TestERC20SetDecimals;
  let controller: HardhatEthersSigner;

  // Cached addresses to avoid repeated async calls
  let repoAddress: string;
  let aliceAddress: string;
  let bobAddress: string;

  const deployContractsFixture = createFixture(
    'simple',
    'none',
    'API',
    true,
    0,
    "0"
  );

  beforeEach(async () => {
    await loadFixture(deployContractsFixture);

    // Initialize signers
    alice = getAlice();
    bob = getBob();

    // Set up contract shortcuts
    repo = hre.f.SC.repositoryContracts[0].repository;
    repoToken = hre.f.SC.repositoryContracts[0].repositoryToken;
    strandsAPI = hre.f.SC.strandsAPI;
    controller = hre.f.SC.repositoryContracts[0].controller;

    // Cache frequently used addresses
    [repoAddress, aliceAddress, bobAddress] = await Promise.all([
      repo.getAddress(),
      alice.getAddress(),
      bob.getAddress()
    ]);

    // Mint some StrandsAPI tokens to alice for all tests that need them
    await strandsAPI.connect(controller).mint(aliceAddress, toBN("10000", 6));
  });


  describe("StrandsAPI Token Access Control", function () {
    it("should enforce access control for minting and burning", async function () {
      const amount = toBN("10000", 6);

      // Controller mint/burn permissions
      await expect(strandsAPI.connect(alice).mint(aliceAddress, amount))
        .to.be.revertedWithCustomError(strandsAPI, "OnlyController");
      await expect(strandsAPI.connect(alice).burn(amount))
        .to.be.revertedWithCustomError(strandsAPI, "OnlyController");

      // Controller should succeed
      await strandsAPI.connect(controller).mint(aliceAddress, amount);
      expect(await strandsAPI.balanceOf(aliceAddress)).to.be.eq(amount * 2n); // 10k from beforeEach + 10k

      const controllerAddress = await controller.getAddress();
      await strandsAPI.connect(controller).mint(controllerAddress, amount);
      await strandsAPI.connect(controller).burn(amount);
      expect(await strandsAPI.balanceOf(controllerAddress)).to.be.eq(0);

      // Owner burn permissions
      await expect(strandsAPI.connect(alice).ownerBurn(aliceAddress, amount))
        .to.be.revertedWithCustomError(strandsAPI, "OnlyOwner");

      await strandsAPI.connect(hre.f.deployer).ownerBurn(aliceAddress, amount);
      expect(await strandsAPI.balanceOf(aliceAddress)).to.be.eq(amount); // Back to 10k
    });
  });

  describe("Repository Operations with SimpleBookKeeper", function () {
    it("should handle complete deposit/NAV/withdrawal cycle", async function () {
      // Initial deposit
      await approveAndDeposit(alice, toBN("1000", 6), true, 'API');
      expect(await repoToken.balanceOf(aliceAddress)).to.be.eq(toBN("1000"));
      expect(await repo.getNAV()).to.be.eq(toBN("1"));
      expect(await repo.getAUM()).to.be.eq(toBN("1000"));

      // External value increase
      await strandsAPI.connect(controller).mint(repoAddress, toBN("250", 6));
      expect(await repo.getNAV()).to.be.eq(toBN("1.25"));

      // Withdrawal process
      const withdrawAmount = "500";
      const minOut = toBN("1", 6);

      await repo.connect(alice).initiateWithdraw(toBN(withdrawAmount), minOut);
      await repo.connect(controller).processWithdrawals(1);
      await repo.connect(alice).redeemClaimable();

      // Verify final state
      expect(await repo.getAUM()).to.be.eq(toBN("625"));
      expect(await repo.getNAV()).to.be.eq(toBN("1.25"));
      expect(await repoToken.balanceOf(aliceAddress)).to.be.eq(toBN(withdrawAmount));
      expect(await strandsAPI.balanceOf(aliceAddress)).to.be.eq(toBN("9625", 6)); // 10000 - 1000 + 625
    });
  });

  describe("Deposit Limits", () => {
    it("should enforce total value cap", async () => {
      await repo.connect(controller).setTotalValueCap18(toBN("500"));
      await approveAndDeposit(alice, toBN("300", 6), true, 'API');

      await expect(repo.connect(alice).initiateDeposit(toBN("300", 6), 0))
        .to.be.revertedWithCustomError(repo, "TotalValueCapReached");

      // Reset for other tests
      await repo.connect(controller).setTotalValueCap18(toBN("100000000"));
    });
  });
});


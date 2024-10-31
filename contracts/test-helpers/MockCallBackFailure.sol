// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.20;

import { MockCallBackContract } from "./MockCallBackContract.sol";
import { IStrandsCallback } from "../interfaces/IStrandsCallback.sol";

// Mock Contract for testing callback failures
contract MockCallBackFailure is IStrandsCallback {


  constructor() {
  }

  function onDepositProcessed(
    address /*recipient*/,
    uint /*amount*/
  ) external pure {
    revert("Deposit callback failed");
  }

  function onWithdrawalProcessed(
    address /*recipient*/,
    uint /*amount*/
  ) external pure {
    revert("Withdrawal callback failed");
  }

  function onClaimProcessOnBehalf(
    address /*recipient*/,
    uint /*amount*/
  ) external pure {
    revert("Claim callback failed");
  }
}
// SPDX-License-Identifier: Reserved
pragma solidity ^0.8.20;

import { IStrandsCallback } from "../interfaces/IStrandsCallback.sol";
import { console } from "hardhat/console.sol";

contract MockCallBackContract is IStrandsCallback {
  address public allowedCaller;

  bool public depositCalled;
  bool public withdrawalCalled;
  bool public claimCalled;

  constructor(address _allowedCaller) {
    allowedCaller = _allowedCaller;
  }

  modifier onlyAllowedCaller() {
    require(msg.sender == allowedCaller, "Caller is not allowed");
    _;
  } 

  // add a function to change the allowedCaller
  function changeAllowedCaller(address _allowedCaller) external {
    allowedCaller = _allowedCaller;
  }

  // write getter for allowedCaller
  function getAllowedCaller() external view returns (address) {
    return allowedCaller;
  }

  function onDepositProcessed(
    address recieptient,
    uint amount
  ) external {
    depositCalled = true;
    emit DepositCallackReceived(recieptient, amount);
  }

  function onWithdrawalProcessed(
    address recieptient,
    uint amount
  ) external virtual {
    withdrawalCalled = true;
    emit WithdrawalCallbackReceived(recieptient, amount);
  }

  function onClaimProcessOnBehalf(
    address recieptient,
    uint amount
  ) external virtual {
    claimCalled = true;
    emit ClaimCallbackReceived(recieptient, amount);
  }

  // helper function to reset all booleans to false
  function resetFlags() external {
    depositCalled = false;
    withdrawalCalled = false;
    claimCalled = false;
  }

  //////////////////////
  // event functions ///
  //////////////////////

  event DepositCallackReceived(address recieptient, uint amount);
  event WithdrawalCallbackReceived(address recieptient, uint amount);
  event ClaimCallbackReceived(address recieptient, uint amount);
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IStrandsCallback } from "./IStrandsCallback.sol";

interface IStrandsCallBackControlsInterface {
 
  /**
   * @dev Returns the callback address for the recipient
   * @param recipient the address of the recipient
   * @return the callback address
   */
  function getCallbackContractForAddress(address recipient) external view returns (WhitelistedContract calldata);

  /**
   * @dev Executes the callback for the recipient
   * @param contractAddress the address of the contract
   * @param isWhitelisted true if the contract is whitelisted
   */
  struct WhitelistedContract {
    address contractAddress;
    bool isWhitelisted;
  }

  // enum for the callbacktypes in withdraw, deposit looop
  enum CallbackType { DEPOSIT, WITHDRAW, CLAIM }
}
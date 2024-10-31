// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../strands/StrandsOwned.sol";
import { IStrandsCallBackControlsInterface } from "../interfaces/IStrandsCallBackControlsInterface.sol";

abstract contract CallBackExclusive is StrandsOwned, IStrandsCallBackControlsInterface {
  mapping(address => WhitelistedContract) private _whitelistedContracts;

  /**
   * @dev Returns the callback address for the recipient
   * @param recipient The address of the recipient
   * @return The Whitelisted Contract Object
   */
  function getCallbackContractForAddress(
    address recipient
  ) external view returns (WhitelistedContract memory) {
    return _whitelistedContracts[recipient];
  }

  /**
   * @dev Sets a contract to be whitelisted
   * @param user The address of the contract
   * @param _isWhitelisted The whitelist status
   */
  function setWhiteListedContractForAddress(
    address user,
    address _contract,
    bool _isWhitelisted
  ) external onlyController {
    _whitelistedContracts[user] = WhitelistedContract(
      _contract,
      _isWhitelisted
    );
  }
}
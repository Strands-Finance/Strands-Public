// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../strands/StrandsOwned.sol";
import "../interfaces/IGateKeeper.sol";
import { IStrandsCallBackControlsInterface } from "../interfaces/IStrandsCallBackControlsInterface.sol";

/**
 * @dev GateKeeper creates a blacklist for repository token transfer
 */
abstract contract GateKeeper is IGateKeeper, StrandsOwned {
  mapping(address => bool) private _repositoryTokenTransferBlacklist;

  bool public depositWhitelistEnabled;

  /////////////
  // Events ///
  /////////////
  

  constructor() StrandsOwned(msg.sender, msg.sender) {}

  function canTransferRepositoryToken(
    address user
  ) external view override returns (bool) {
    return !_repositoryTokenTransferBlacklist[user];
  }

  ///////////////////////////
  // Controller Functions ///
  ///////////////////////////
  
  /**
   * @dev Adds users to the transfer blacklist
   * @param users The users to add to the blacklist
   * @notice Only callable by the controller
   */
  function addToTransferBlacklist(
    address[] memory users
  ) external onlyController {
    for (uint i = 0; i < users.length; i++) {
      _repositoryTokenTransferBlacklist[users[i]] = true;
    }
  }

  /**
   * @dev Removes users from the transfer blacklist
   * @param users The users to remove from the blacklist
   * @notice Only callable by the controller
   */
  function removeFromTransferBlacklist(
    address[] memory users
  ) external onlyController {
    for (uint i = 0; i < users.length; i++) {
      _repositoryTokenTransferBlacklist[users[i]] = false;
    }
  }

  /**
   * @dev Sets the deposit whitelist flag
   * @param depositWhitelistEnabled_ bool flag to enable or disable the deposit whitelist
   * @notice Only callable by the controller
   */
  function setDepositWhitelistEnabled(
    bool depositWhitelistEnabled_
  ) external onlyController {
    depositWhitelistEnabled = depositWhitelistEnabled_;

    emit DepositWhitelistEnabled(depositWhitelistEnabled);
  }

  /////////////
  // Events ///
  /////////////

  /**
   * @dev Emitted when the deposit whitelist is enabled or disabled
   * @param flag The new flag value
   */
  event DepositWhitelistEnabled(bool flag);

}

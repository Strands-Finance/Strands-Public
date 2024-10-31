// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../strands/StrandsOwned.sol";
import "../interfaces/IGateKeeper.sol";
import { IStrandsCallBackControlsInterface } from "../interfaces/IStrandsCallBackControlsInterface.sol";

/**
 * @dev GateKeeperImpl manages the repository token transfer blacklist and deposit whitelist.
 */
contract CallBackGateKeeper is
  IGateKeeper,
  StrandsOwned,
  IStrandsCallBackControlsInterface
{
  mapping(address => bool) private _repositoryTokenTransferBlacklist;
  mapping(address => WhitelistedContract) private _whitelistedContracts;
  mapping (address => bool) private _canDeposit;

  bool public depositWhitelistEnabled;

  constructor(
    address owner,
    address controller
  ) StrandsOwned(owner, controller) {}


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

  /**
   * @dev Returns a boolean indicating whether or not the user can transfer the repository token
   * @param user The address of the user
   */
  function canTransferRepositoryToken(
    address user
  ) external view override returns (bool) {
    return !_repositoryTokenTransferBlacklist[user];
  }

  /**
   * @dev Returns a boolean indicating whether or not the user can deposit
   * @param user The address of the user
   */
  function canDeposit(address user) external view override returns (bool) {
    if (depositWhitelistEnabled) {
      return _canDeposit[user];
    }
    return true;
  }

  ///////////////////////////
  // Controller Functions ///
  ///////////////////////////

  /**
   * @dev Adds a list of users to the repository token transfer blacklist
   * @param users The addresses of the users to be blacklisted
   */
  function addToTransferBlacklist(
    address[] memory users
  ) external onlyController {
    for (uint i = 0; i < users.length; i++) {
      _repositoryTokenTransferBlacklist[users[i]] = true;
    }
  }

  /**
   * @dev Removes a list of users from the repository token transfer blacklist
   * @param users The addresses of the users to be removed from the blacklist
   */
  function removeFromTransferBlacklist(
    address[] memory users
  ) external onlyController {
    for (uint i = 0; i < users.length; i++) {
      _repositoryTokenTransferBlacklist[users[i]] = false;
    }
  }

  /**
   * @dev Enables or disables the deposit whitelist
   * @param depositWhitelistEnabled_ The new state of the deposit whitelist
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
  event DepositWhitelistEnabled(bool flag);
}
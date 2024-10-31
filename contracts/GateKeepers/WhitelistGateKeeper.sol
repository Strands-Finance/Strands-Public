// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../strands/StrandsOwned.sol";
import "./GateKeeper.sol";
import { CallBackExclusive } from "./CallBackExclusive.sol";

/**
 * @dev GateKeeper for repository systems where users need to KYC, deposit gated by a whitelist
 */
contract WhitelistGateKeeper is GateKeeper, CallBackExclusive {
  mapping(address => bool) private _canDeposit;

  constructor() {}

  function canDeposit(address user) external view override returns (bool) {
    if (depositWhitelistEnabled) {
      return _canDeposit[user];
    }
    return true;
  }

  ///////////////////////////
  // Controller Functions ///
  ///////////////////////////
  function setUserCanDeposit(address[] memory users) external onlyController {
    for (uint i = 0; i < users.length; i++) {
      _canDeposit[users[i]] = true;
    }
  }

  function unsetUserCanDeposit(address[] memory users) external onlyController {
    for (uint i = 0; i < users.length; i++) {
      _canDeposit[users[i]] = false;
    }
  }
}
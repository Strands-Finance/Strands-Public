// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BookKeeper} from "./BookKeeper.sol";
import {ConvertDecimals} from "../utils/ConvertDecimals.sol";
import "../synthetix/DecimalMath.sol";

/// @dev Simple bookkeeper where AUM = total depositAsset (minus pending deposits) + executor value
contract SimpleBookKeeper is BookKeeper {
  using DecimalMath for uint;

  constructor() BookKeeper() {}

  /// @dev mark valueOffChainSettled to true
  /// @dev not used here
  function markValueOffChainSettled(bool _valueOffChainSettled) external {}

  /// @dev returns AUM in both units and block timestamp
  function getLastKnownAUM()
    external
    view
    override
    returns (uint aumUsd, uint aumDepositAsset, uint timestamp)
  {
    aumUsd = _getAUM();
    aumDepositAsset = _convertUsdToDepositAsset(aumUsd);
    timestamp = block.timestamp;
  }

  /// @dev returns NAV in both units and block timestamp
  function getLastKnownNAV()
    external
    view
    override
    returns (uint navUsd, uint navDepositAsset, uint timestamp)
  {
    navUsd = _getNAV();
    navDepositAsset = _convertUsdToDepositAsset(navUsd);
    timestamp = block.timestamp;
  }
}

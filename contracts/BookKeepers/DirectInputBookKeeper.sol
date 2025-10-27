// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BookKeeper} from "./BookKeeper.sol";
import {ConvertDecimals} from "../utils/ConvertDecimals.sol";
import "../synthetix/DecimalMath.sol";

// This contract is written to allow for direct input of valueOffChain
contract DirectInputBookKeeper is BookKeeper {
  using DecimalMath for uint;

  bool public valueOffChainSettled; // flag funds settled or not
  uint public valueOffChain18 = 0; //value off chain in 18 decimals
  uint public valueOffChainStaleTS = 0; //default to 0 so we don't flag valueOffChain as stale initially

  constructor() BookKeeper() {}

  /**
   * @dev mark valueOffChainSettled to true
   * @dev repository or repository controller can call this
   */
  function markValueOffChainSettled(bool _valueOffChainSettled) external {
    if (
      !repository.isController(msg.sender) && address(repository) != msg.sender
    ) {
      revert OnlyRepositoryOrController();
    }
    valueOffChainSettled = _valueOffChainSettled;
  }

  /// @dev Mark valueOffChain
  /// @param value the value to update to in 1e18
  /// @param validFor seconds till this value becomes stale
  function markValueOffChain18(
    uint value,
    uint validFor,
    uint expectedNAV
  ) external onlyRepositoryController {
    valueOffChain18 = value;

    valueOffChainStaleTS = block.timestamp + validFor;

    lastKnownTimestamp = block.timestamp;
    lastKnownUsdAUM = _getAUM();
    lastKnownUsdNAV18 = _getNAV();

    valueOffChainSettled = true;

    _checkExpectedNAV(expectedNAV);

    emit valueOffChainUpdated(value, block.timestamp, msg.sender);
    emit NAVUpdated(lastKnownUsdNAV18, block.timestamp, msg.sender);
    emit AUMUpdated(lastKnownUsdAUM, block.timestamp, msg.sender);
  }

  /// @dev Returns the AUM of the pool in terms of both usd and depositAsset, revert if valueOffChain is not up to date
  function getAUM()
    external
    view
    override
    returns (uint aumUsd, uint aumDepositAsset)
  {
    _valueOffChainValidityCheck();
    aumUsd = _getAUM();
    aumDepositAsset = _convertUsdToDepositAsset(aumUsd);
  }

  /**
   * @dev Use to process deposits/withdrawals so valueOffChain absolutely have to be up to date or it would revert
   * @return navUsd The NAV in USD units
   * @return navDepositAsset The NAV in deposit asset units
   */
  function getNAV()
    external
    view
    override
    returns (uint navUsd, uint navDepositAsset)
  {
    _valueOffChainValidityCheck();
    navUsd = _getNAV();
    navDepositAsset = _convertUsdToDepositAsset(navUsd);
  }

  function checkExpectedNAV(uint expectedNAV) external view override {
    _valueOffChainValidityCheck();
    _checkExpectedNAV(expectedNAV);
  }

  //AUM = on-chain value + valueOffChain
  function _getAUM() internal view override returns (uint) {
    int totalAUM = _getValueOnChain() + int(valueOffChain18);

    // Only convert to uint at the end, with proper validation
    if (totalAUM < 0) {
      revert NonPositiveAUM(totalAUM);
    }
    return uint(totalAUM);
  }

  /**
   * @dev Checks valueOffChain is valid
   */
  function _valueOffChainValidityCheck() internal view {
    if (valueOffChainStaleTS > 0 && valueOffChainStaleTS < block.timestamp) {
      revert MarkedValueStale(block.timestamp, valueOffChainStaleTS);
    }

    if (!valueOffChainSettled) {
      revert ValueOffChainNotSettled();
    }
  }

  ////////////
  // EVENT ///
  ////////////
  event valueOffChainUpdated(uint value, uint timestamp, address indexed owner);
  event NAVUpdated(uint value, uint timestamp, address indexed owner);
  event AUMUpdated(uint value, uint timestamp, address indexed owner);
}

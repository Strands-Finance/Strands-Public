// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IStrandsAccount} from "../interfaces/IStrandsAccount.sol";
import {BookKeeper} from "./BookKeeper.sol";
import "../synthetix/DecimalMath.sol";

// This contract is written to get valueOffChain from accountNFT
contract AccountNFTBookKeeper is BookKeeper {
  using DecimalMath for uint;

  bool public valueOffChainSettled; // flag funds settled or not
  uint public valueOffChain18 = 0; //value off chain in 18 decimals
  uint public valueOffChainStaleTS = 0; //default to 0 so we don't flag valueOffChain as stale initially

  address public accountNFT;
  uint public accountTokenId;

  constructor() BookKeeper() {}

  function setAccountNFT(
    address _accountNFT,
    uint _tokenId
  ) external onlyOwner validAddress(_accountNFT) {
    accountNFT = _accountNFT;
    accountTokenId = _tokenId;
    valueOffChainSettled = false;
  }

  /// @dev mark valueOffChainSettled to true
  /// @dev repository or repository controller can call this
  function markValueOffChainSettled(
    bool _valueOffChainSettled
  ) external {
    if (
      !repository.isController(msg.sender) && address(repository) != msg.sender
    ) {
      revert OnlyRepositoryOrController();
    }
    valueOffChainSettled = _valueOffChainSettled;
  }

  function updateValueOffChain18(
    uint validFor,
    uint expectedNAV
  ) external onlyRepositoryController {
    if (accountNFT == address(0)) {
      revert AccountNFTNotSet();
    }
    int value = IStrandsAccount(accountNFT).getAccountValue(accountTokenId);
    if (value < 0) {
      revert AccountNFTValueMustBePositive(value);
    }
    valueOffChain18 = uint(value);

    uint ts = IStrandsAccount(accountNFT).getStatementTimestamp(accountTokenId);

    if (ts == 0) {
      revert AccountDoesNotExist(accountTokenId);
    }
    valueOffChainStaleTS = ts + validFor;

    lastKnownTimestamp = block.timestamp;
    lastKnownUsdAUM = _getAUM();
    lastKnownUsdNAV18 = _getNAV();

    _checkExpectedNAV(expectedNAV);

    emit valueOffChainUpdated(valueOffChain18, block.timestamp, msg.sender);
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
    if (accountNFT == address(0)) {
      revert AccountNFTNotSet();
    }
    if (valueOffChainStaleTS > 0 && valueOffChainStaleTS < block.timestamp) {
      revert MarkedValueStale(block.timestamp, valueOffChainStaleTS);
    }

    if (!valueOffChainSettled) {
      revert ValueOffChainNotSettled();
    }
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
    if (accountNFT == address(0)) {
      revert AccountNFTNotSet();
    }
    if (valueOffChainStaleTS > 0 && valueOffChainStaleTS < block.timestamp) {
      revert MarkedValueStale(block.timestamp, valueOffChainStaleTS);
    }

    if (!valueOffChainSettled) {
      revert ValueOffChainNotSettled();
    }

    navUsd = _getNAV();
    navDepositAsset = _convertUsdToDepositAsset(navUsd);
  }

  function checkExpectedNAV(uint expectedNAV) external view override {
    if (accountNFT == address(0)) {
      revert AccountNFTNotSet();
    }
    if (valueOffChainStaleTS > 0 && valueOffChainStaleTS < block.timestamp) {
      revert MarkedValueStale(block.timestamp, valueOffChainStaleTS);
    }

    if (!valueOffChainSettled) {
      revert ValueOffChainNotSettled();
    }

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

  ////////////
  // EVENT ///
  ////////////

  event valueOffChainUpdated(uint value, uint timestamp, address indexed owner);
  event NAVUpdated(uint value, uint timestamp, address indexed owner);
  event AUMUpdated(uint value, uint timestamp, address indexed owner);

  // ERRORS
  // MarkedValueStale error inherited from IBookKeeper
  // NonPositiveAUM error inherited from IBookKeeper
  error AccountNFTNotSet();
  error AccountNFTValueMustBePositive(int value);
  error AccountDoesNotExist(uint tokenId);
}

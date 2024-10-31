// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBasePriceOracle {

  ////////////////
  // GETTERS ////
  //////////////

  /// @dev Return price oracle response which consists the following information: oracle is broken or frozen, the
  /// price change between two rounds is more than max, and the price.
  function getPriceFromFeed() external view returns (int256);

  /// @dev Time since the last update
  function getLastUpdate() external view returns (uint256);

  /// @dev gets price deviation from the last update.
  function getDeviation() external view returns (uint256);

  /// @dev returns the number of decimals the pair is in.
  function getDecimals() external view returns (uint256);

  //////////////
  /// ERRORS ///
  //////////////

  /// @dev Contract initialized with an invalid deviation parameter.
  error InvalidDeviation();

}
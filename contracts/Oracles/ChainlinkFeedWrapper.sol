// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "../interfaces/IBasePriceOracle.sol";

import "hardhat/console.sol";

contract ChainlinkFeedWrapper is IBasePriceOracle {
  AggregatorV3Interface internal priceFeed;

  constructor(address aggregatorAddress) {
    priceFeed = AggregatorV3Interface(aggregatorAddress);
  }

  function getPriceFromFeed() public view override returns (int) {
    (
      uint80 roundID,
      int price,
      uint startedAt,
      uint timeStamp,
      uint80 answeredInRound
    ) = priceFeed.latestRoundData();

    return price;
  }

  function getDeviation() public view override returns (uint256) {
    // Implement your logic to calculate deviation
    return 0;
  }

  function getDecimals() external view override returns (uint256) {
    return priceFeed.decimals();
  }

  function getLastUpdate() external view override returns (uint256) {
    return 0;
  }
}

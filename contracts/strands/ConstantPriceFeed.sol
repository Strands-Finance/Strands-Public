// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./StrandsOwned.sol";

/// @title ConstantPriceFeed
/// @notice A simple price feed that always returns a constant price value
/// @dev Useful for stablecoins or tokens that should maintain a fixed USD value
contract ConstantPriceFeed is AggregatorV3Interface, StrandsOwned {
    int256 private constant PRICE = 1e8; // $1.00 with 8 decimals (Chainlink standard)
    uint8 private constant DECIMALS = 8;

    constructor(address _owner, address _controller) StrandsOwned(_owner, _controller) {
        // No stored timestamp needed - always return current block timestamp
    }

    /// @notice Returns the number of decimals for the price
    /// @return decimals Always returns 8 (Chainlink standard)
    function decimals() external pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Returns the description of the price feed
    /// @return description The description string
    function description() external pure override returns (string memory) {
        return "Constant $1.00 USD Price Feed";
    }

    /// @notice Returns the version of the price feed
    /// @return version Always returns 1
    function version() external pure override returns (uint256) {
        return 1;
    }

    /// @notice Returns round data for a specific round ID
    /// @param _roundId The round ID (ignored, always returns current data)
    /// @return roundId The round ID
    /// @return answer The constant price (1e8)
    /// @return startedAt The current block timestamp
    /// @return updatedAt The current block timestamp
    /// @return answeredInRound The round ID in which the answer was computed
    function getRoundData(uint80 _roundId) external view override returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (_roundId, PRICE, block.timestamp, block.timestamp, _roundId);
    }

    /// @notice Returns the latest round data
    /// @return roundId The round ID (always 1)
    /// @return answer The constant price (1e8)
    /// @return startedAt The current block timestamp
    /// @return updatedAt The current block timestamp
    /// @return answeredInRound The round ID in which the answer was computed
    function latestRoundData() external view override returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (1, PRICE, block.timestamp, block.timestamp, 1);
    }

}
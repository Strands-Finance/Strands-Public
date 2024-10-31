//SPDX-License-Identifier: ISC
pragma solidity ^0.8.20;

interface IStrandsPosition {
  struct TradeDetails {
    string tag50;
    string tradeId;
    bool isLong;
    uint quantity;
    uint purchasePrice;
    uint executionTime; // Must set to executionTime>0 so we can use executionTime==0 to identify if AccountDetails is null
  }

  struct SymbolInfo {
    string symbol;
    string source;
  }

  struct PositionDetails {
    uint symbolId;
    string clearingFirm;
    string accountNumber;
    string[] tradeIds;
    uint lastTradingDate;
    bool expired;
    uint tokenId;
  }

  event PositionCreated(
    uint256 indexed tokenId,
    address indexed owner,
    string symbol,
    string exchange,
    string clearingFirm,
    string accountNumber,
    uint256 lastTradingDate
  );

  event PositionExpired(address tokenOwner, uint tokenId);

  event TradeAdded(
    uint256 indexed tokenId,
    string tradeId,
    string tag50,
    uint256 quantity,
    uint256 price,
    uint256 executionTime,
    bool isLong
  );

  event TradeDeleted(uint256 indexed tokenId, string tradeId);
  event PositionDeleted(uint256 indexed tokenId);

  function transferFrom(address from, address to, uint256 id) external;

  function getOwnerTokenIds(
    address target
  ) external view returns (uint256[] memory);

  function getTokenId(
    string memory clearingFirm_,
    string memory accountNumber_,
    string memory symbol_,
    string memory exchange_
  ) external view returns (uint);

  function getPositionDetails(
    uint tokenId
  ) external view returns (PositionDetails memory);

  function getPositionsByAccount(
    string memory clearingFirm_,
    string memory accountNumber_,
    bool includeExpiredPosition_
  ) external view returns (PositionDetails[] memory);

  function getPositionIdsByAccount(
    string memory clearingFirm_,
    string memory accountNumber_,
    bool includeExpiredPosition_
  ) external view returns (uint[] memory);

  function batchTransferFrom(
    address from,
    address to,
    uint[] memory tokenIds
  ) external;

  function deletePositions(uint[] memory tokenIds) external;
}

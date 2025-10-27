//SPDX-License-Identifier: ISC
pragma solidity ^0.8.20;

interface IStrandsPosition {
  // State errors
  error InvalidPositionTokenId();
  error PositionDeletionInProgress();
  error NoDeletionInProgress();

  // Validation errors
  error InvalidExecutionTime();
  error InvalidSymbolId();
  error BeforeLastTradingDate();

  // Existence errors
  error AlreadyExists();
  error TradeDoesNotExist();

  // Authorization errors
  error UnauthorizedOwner();

  // Input errors
  error EmptyString();
  error ZeroAddress();
  error ZeroValue();

  struct TradeDetails {
    string tag50;
    string tradeId;
    bool isLong;
    uint quantity;
    uint purchasePrice;
    uint executionTime; // Must set to executionTime>0 so we can use executionTime==0 to identify if AccountDetails is null
    uint tradeDate;
  }

  struct SymbolInfo {
    string symbol;
    string exchange;
  }

  struct PositionDetails {
    uint symbolId;
    string clearingFirm;
    string accountNumber;
    string[] tradeIds;
    uint lastTradingDate;
    bool expired;
    uint tokenId;
    int256 totalQuantity; // Net quantity: longs are positive, shorts are negative
  }

  event PositionCreated(
    uint256 indexed tokenId,
    address indexed owner,
    uint256 symbolId,
    string symbol,
    string exchange,
    string clearingFirm,
    string accountNumber,
    uint256 lastTradingDate,
    bool expired
  );
  event PositionDeleted(uint256 indexed tokenId);
  event PositionExpired(address tokenOwner, uint tokenId);

  event TradeAdded(
    uint256 indexed tokenId,
    string tradeId,
    string tag50,
    uint256 quantity,
    uint256 price,
    uint256 executionTime,
    bool isLong,
    uint256 tradeDate,
    int256 totalQuantity
  );
  event TradeDeleted(
    uint256 indexed tokenId,
    string tradeId,
    int256 totalQuantity
  );

  event SymbolIdUpdated(
    uint256 indexed tokenId,
    uint256 oldSymbolId,
    uint256 newSymbolId
  );
  event SymbolInfoUpdated(
    uint256 indexed symbolId,
    string oldSymbol,
    string oldExchange,
    string newSymbol,
    string newExchange
  );

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

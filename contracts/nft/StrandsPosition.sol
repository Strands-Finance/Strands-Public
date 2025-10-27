// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ERC721} from "solmate/src/tokens/ERC721.sol";
import {StrandsOwned} from "../strands/StrandsOwned.sol";
import {IStrandsPosition} from "../interfaces/IStrandsPosition.sol";

contract StrandsPosition is ERC721, StrandsOwned, IStrandsPosition {
  uint public mintCounter;
  mapping(bytes32 => uint) public symbolToSymbolId; /// bytes32 = keccak256(abi.encode(symbol,exchange))
  mapping(uint => SymbolInfo) public symbolIdToSymbol;
  uint256 private nextSymbolId = 1;
  mapping(string => TradeDetails) public trades;

  // private variables
  mapping(bytes32 => uint) private casToTokenId; /// bytes32 = keccak256(abi.encode(clearingFirm, accountNumber, symbolId))
  mapping(address => uint[]) private _ownedPositionIds; // Owner -> Owned Token Ids
  mapping(uint => PositionDetails) private positionDetails;
  mapping(uint => mapping(string => uint)) private tradeIdIndex; // tokenId -> tradeId -> (index + 1) in tradeIds array. 0 means doesn't exist
  mapping(bytes32 => uint[]) private accountToPositionIds; // bytes32 = keccak256(abi.encode(clearingFirm, accountNumber)) -> position tokenIds
  mapping(bytes32 => mapping(uint => uint)) private positionIndexByAccount; // accountKey -> tokenId -> (index + 1) in accountToPositionIds array
  mapping(address => mapping(uint => uint)) private positionIndexByOwner; // owner -> tokenId -> (index + 1) in _ownedPositionIds array
  mapping(uint => bool) private positionDeletionInProgress; // tokenId -> true if deletion in progress
  string private tURI;

  constructor(
    string memory _name,
    string memory _symbol,
    string memory _tURI
  ) ERC721(_name, _symbol) StrandsOwned(msg.sender, msg.sender) {
    tURI = _tURI;
  }

  /**
   * @dev Get token uri of token id
   * @param tokenId id of nft
   */
  function tokenURI(
    uint tokenId
  ) public view override(ERC721) returns (string memory) {
    if (!(mintCounter == 0 || tokenId <= mintCounter))
      revert InvalidPositionTokenId();
    return tURI;
  }

  /**
   * @dev Set token uri of token id
   * @param _tURI token uri
   */
  function setTokenURI(string memory _tURI) public onlyController {
    tURI = _tURI;
  }

  /**
   * @dev Get position details
   * @param tokenId id of nft
   */
  function getPositionDetails(
    uint tokenId
  ) public view returns (PositionDetails memory) {
    if (_ownerOf[tokenId] == address(0)) revert InvalidPositionTokenId();
    return positionDetails[tokenId];
  }

  /**
   * @dev Mint NFT
   * @param to address which will receive nft
   * @param symbol_ position symbol name
   * @param exchange_ position exchange name
   * @param clearingFirm_ position clearing firm
   * @param accountNumber_ position account number
   * @param lastTradingDate_ last trading date
   * @param tradeDetails_ trade details follow TradeDetails struct
   */
  function mint(
    address to,
    string calldata symbol_,
    string calldata exchange_,
    string calldata clearingFirm_,
    string calldata accountNumber_,
    uint lastTradingDate_,
    TradeDetails calldata tradeDetails_
  ) public onlyController returns (uint) {
    uint symbolId = _getOrCreateSymbolId(symbol_, exchange_);

    // Use scoped blocks to release stack variables early
    {
      // Check NFT exists with same clearingFirm_ and accountNumber_ and symbol_
      bytes32 casKey = keccak256(
        abi.encode(clearingFirm_, accountNumber_, symbolId)
      );
      if (casToTokenId[casKey] != 0) revert AlreadyExists();

      mintCounter += 1;
      casToTokenId[casKey] = mintCounter;
    }

    // If we force it to be > 0, we can see if trades[tradeId] exists by checking if executionTime == 0
    if (tradeDetails_.executionTime == 0) revert InvalidExecutionTime();
    trades[tradeDetails_.tradeId] = tradeDetails_;
    positionDetails[mintCounter].tradeIds.push(tradeDetails_.tradeId);
    positionDetails[mintCounter].symbolId = symbolId;
    positionDetails[mintCounter].clearingFirm = clearingFirm_;
    positionDetails[mintCounter].accountNumber = accountNumber_;
    positionDetails[mintCounter].lastTradingDate = lastTradingDate_;
    positionDetails[mintCounter].tokenId = mintCounter;
    positionDetails[mintCounter].expired = lastTradingDate_ < block.timestamp;

    // Initialize totalQuantity (inline to avoid extra variable)
    positionDetails[mintCounter].totalQuantity = tradeDetails_.isLong
      ? int256(tradeDetails_.quantity)
      : -int256(tradeDetails_.quantity);

    // Set trade index for O(1) lookup
    tradeIdIndex[mintCounter][tradeDetails_.tradeId] = 1; // Store index + 1

    {
      // Track position in account mapping (scoped block)
      bytes32 accountKey = keccak256(abi.encode(clearingFirm_, accountNumber_));
      accountToPositionIds[accountKey].push(mintCounter);
      positionIndexByAccount[accountKey][mintCounter] = accountToPositionIds[
        accountKey
      ].length;
    }

    // Track position in owner mapping
    _ownedPositionIds[to].push(mintCounter);
    positionIndexByOwner[to][mintCounter] = _ownedPositionIds[to].length;

    emit PositionCreated(
      mintCounter,
      to,
      symbolId,
      symbol_,
      exchange_,
      clearingFirm_,
      accountNumber_,
      lastTradingDate_,
      positionDetails[mintCounter].expired
    );

    emit TradeAdded(
      mintCounter,
      tradeDetails_.tradeId,
      tradeDetails_.tag50,
      tradeDetails_.quantity,
      tradeDetails_.purchasePrice,
      tradeDetails_.executionTime,
      tradeDetails_.isLong,
      tradeDetails_.tradeDate,
      positionDetails[mintCounter].totalQuantity
    );

    _safeMint(to, mintCounter);

    return mintCounter;
  }

  /**
   * @dev Add trade to nft
   * @param owner_ position owner address
   * @param symbol_ position symbol name
   * @param exchange_ position exchange name
   * @param clearingFirm_ position clearing firm
   * @param accountNumber_ position account number
   * @param lastTradingDate_ last trading date
   * @param tradeDetails_ trade details follow TradeDetails struct
   */
  function addTrade(
    address owner_,
    string calldata symbol_,
    string calldata exchange_,
    string calldata clearingFirm_,
    string calldata accountNumber_,
    uint lastTradingDate_,
    TradeDetails calldata tradeDetails_
  ) external onlyController {
    // Check owner is address(0)
    if (owner_ == address(0)) revert ZeroAddress();

    uint tokenId = getTokenId(
      clearingFirm_,
      accountNumber_,
      symbol_,
      exchange_
    );

    if (trades[tradeDetails_.tradeId].executionTime != 0)
      revert AlreadyExists();

    // Mint position to owner_ when matching position not available
    if (tokenId == 0) {
      tokenId = mint(
        owner_,
        symbol_,
        exchange_,
        clearingFirm_,
        accountNumber_,
        lastTradingDate_,
        tradeDetails_
      );
    } else {
      if (ownerOf(tokenId) != owner_) revert UnauthorizedOwner();
      if (positionDeletionInProgress[tokenId])
        revert PositionDeletionInProgress();

      // If we force it to be > 0, we can see if trades[tradeId] exists by checking if executionTime == 0
      if (tradeDetails_.executionTime == 0) revert InvalidExecutionTime();
      trades[tradeDetails_.tradeId] = tradeDetails_;
      positionDetails[tokenId].tradeIds.push(tradeDetails_.tradeId);

      // Update totalQuantity
      int256 tradeQuantity = int256(tradeDetails_.quantity);
      positionDetails[tokenId].totalQuantity += tradeDetails_.isLong
        ? tradeQuantity
        : -tradeQuantity;

      // Set trade index for O(1) lookup
      tradeIdIndex[tokenId][tradeDetails_.tradeId] = positionDetails[tokenId]
        .tradeIds
        .length; // Store index + 1

      emit TradeAdded(
        tokenId,
        tradeDetails_.tradeId,
        tradeDetails_.tag50,
        tradeDetails_.quantity,
        tradeDetails_.purchasePrice,
        tradeDetails_.executionTime,
        tradeDetails_.isLong,
        tradeDetails_.tradeDate,
        positionDetails[tokenId].totalQuantity
      );
    }
  }

  /**
   * @dev Delete trade
   * @param tradeId_ trade id to delete
   * @param symbol_ position symbol name
   * @param exchange_ position exchange name
   * @param clearingFirm_ position clearing firm
   * @param accountNumber_ position account number
   */
  function deleteTrade(
    string calldata tradeId_,
    string calldata symbol_,
    string calldata exchange_,
    string calldata clearingFirm_,
    string calldata accountNumber_
  ) external onlyController {
    uint positionId = casToTokenId[
      keccak256(
        abi.encode(
          clearingFirm_,
          accountNumber_,
          _getSymbolId(symbol_, exchange_)
        )
      )
    ];

    if (positionId == 0) revert TradeDoesNotExist();

    // Check if trade exists (inline _tradeIdExists logic)
    if (tradeIdIndex[positionId][tradeId_] == 0) revert TradeDoesNotExist();

    // Call internal helper to reduce stack usage
    _deleteTradeInternal(positionId, tradeId_);
  }

  /**
   * @dev Internal helper to delete trade - reduces stack usage in deleteTrade
   */
  function _deleteTradeInternal(
    uint tokenId,
    string calldata tradeId_
  ) internal {
    if (positionDeletionInProgress[tokenId])
      revert PositionDeletionInProgress();

    string[] storage tradeIds = positionDetails[tokenId].tradeIds;

    // Update totalQuantity before deleting
    {
      TradeDetails storage trade = trades[tradeId_];
      positionDetails[tokenId].totalQuantity -= trade.isLong
        ? int256(trade.quantity)
        : -int256(trade.quantity);
    }

    if (tradeIds.length == 1) {
      deletePosition(tokenId);
    } else {
      // Use O(1) index lookup
      uint indexPlusOne = tradeIdIndex[tokenId][tradeId_];
      uint index = indexPlusOne - 1;

      // Swap with last element
      string memory lastTradeId = tradeIds[tradeIds.length - 1];
      tradeIds[index] = lastTradeId;
      tradeIdIndex[tokenId][lastTradeId] = indexPlusOne; // Update swapped element's index

      tradeIds.pop();
      delete tradeIdIndex[tokenId][tradeId_];
    }

    delete trades[tradeId_];
    emit TradeDeleted(
      tokenId,
      tradeId_,
      positionDetails[tokenId].totalQuantity
    );
  }

  /**
   * @dev Delete multiple positions
   * @param pids position ids to delete
   */
  function deletePositions(uint[] memory pids) external onlyController {
    for (uint i = 0; i < pids.length; i++) {
      deletePosition(pids[i]);
    }
  }

  /**
   * @dev Delete position
   * @param tokenId position id to delete
   */
  function deletePosition(uint tokenId) public onlyController {
    if (_ownerOf[tokenId] == address(0)) revert InvalidPositionTokenId();

    PositionDetails storage positionDetail = positionDetails[tokenId];

    // If position has > 100 trades, start batch deletion process
    if (positionDetail.tradeIds.length > 100) {
      positionDeletionInProgress[tokenId] = true;
      return;
    }

    // Otherwise, delete immediately
    _deletePositionInternal(tokenId);
  }

  /**
   * @dev Continue deleting position in batches for positions with many trades
   * @param tokenId position id being deleted
   * @param batchSize number of trades to delete in this batch
   */
  function deletePositionBatch(
    uint tokenId,
    uint batchSize
  ) external onlyController {
    if (_ownerOf[tokenId] == address(0)) revert InvalidPositionTokenId();
    if (!positionDeletionInProgress[tokenId]) revert NoDeletionInProgress();
    if (batchSize == 0) revert ZeroValue();

    PositionDetails storage positionDetail = positionDetails[tokenId];
    uint tradesToDelete = positionDetail.tradeIds.length < batchSize
      ? positionDetail.tradeIds.length
      : batchSize;

    // Delete trades from the end
    for (uint i = 0; i < tradesToDelete; i++) {
      uint lastIndex = positionDetail.tradeIds.length - 1;
      string memory tradeId = positionDetail.tradeIds[lastIndex];

      // Update totalQuantity before deleting
      TradeDetails storage trade = trades[tradeId];
      positionDetail.totalQuantity -= trade.isLong
        ? int256(trade.quantity)
        : -int256(trade.quantity);

      // Clear trade index mapping
      delete tradeIdIndex[tokenId][tradeId];
      delete trades[tradeId];
      positionDetail.tradeIds.pop();

      emit TradeDeleted(tokenId, tradeId, positionDetail.totalQuantity);
    }

    // If all trades deleted, finalize the deletion
    if (positionDetail.tradeIds.length == 0) {
      positionDeletionInProgress[tokenId] = false;
      _deletePositionInternal(tokenId);
    }
  }

  /**
   * @dev Internal function to finalize position deletion
   * @param tokenId position id to delete
   */
  function _deletePositionInternal(uint tokenId) internal {
    PositionDetails storage positionDetail = positionDetails[tokenId];

    // Delete remaining trades
    for (uint i = 0; i < positionDetail.tradeIds.length; i++) {
      string memory tradeId = positionDetail.tradeIds[i];
      delete tradeIdIndex[tokenId][tradeId];
      delete trades[tradeId];
    }

    // Clear casToTokenId mapping
    bytes32 casKey = keccak256(
      abi.encode(
        positionDetail.clearingFirm,
        positionDetail.accountNumber,
        positionDetail.symbolId
      )
    );
    casToTokenId[casKey] = 0;

    // Clear account position mapping
    bytes32 accountKey = keccak256(
      abi.encode(positionDetail.clearingFirm, positionDetail.accountNumber)
    );
    uint posIndex = positionIndexByAccount[accountKey][tokenId];
    if (posIndex > 0) {
      uint arrayIndex = posIndex - 1;
      uint[] storage posArray = accountToPositionIds[accountKey];
      if (arrayIndex < posArray.length - 1) {
        uint lastTokenId = posArray[posArray.length - 1];
        posArray[arrayIndex] = lastTokenId;
        positionIndexByAccount[accountKey][lastTokenId] = posIndex;
      }
      posArray.pop();
      delete positionIndexByAccount[accountKey][tokenId];
    }

    burn(tokenId);
    emit PositionDeleted(tokenId);
  }

  /**
   * @dev Loop through all positions to mark expired ones
   */
  function expirePositions(uint[] calldata pids) external onlyController {
    for (uint i = 0; i < pids.length; ++i) {
      if (
        positionDetails[pids[i]].expired == false &&
        positionDetails[pids[i]].lastTradingDate < block.timestamp
      ) {
        _expirePosition(pids[i]);
      }
    }
  }

  /**
   * @dev Expire position
   * @param tokenId_ token id of position to be expired
   */
  function expirePosition(uint tokenId_) public onlyController {
    _expirePosition(tokenId_);
  }

  /**
   * @dev Update symbol+exchange for symbolId
   * @param symbolId symbol id that needs to be udpated
   * @param newSymbol new symbol for the id
   * @param newExchange new exchange for the id
   */
  function updateInfoForSymbolId(
    uint symbolId,
    string memory newSymbol,
    string memory newExchange
  ) external onlyController {
    if (symbolId >= nextSymbolId) revert InvalidSymbolId();
    if (bytes(newSymbol).length == 0) revert EmptyString();
    if (bytes(newExchange).length == 0) revert EmptyString();
    bytes32 newSymbolKey = keccak256(abi.encode(newSymbol, newExchange));
    if (symbolToSymbolId[newSymbolKey] != 0) revert AlreadyExists();

    string memory oldSymbol = symbolIdToSymbol[symbolId].symbol;
    string memory oldExchange = symbolIdToSymbol[symbolId].exchange;

    bytes32 oldSymbolKey = keccak256(abi.encode(oldSymbol, oldExchange));

    delete symbolToSymbolId[oldSymbolKey];
    symbolToSymbolId[newSymbolKey] = symbolId;
    symbolIdToSymbol[symbolId].symbol = newSymbol;
    symbolIdToSymbol[symbolId].exchange = newExchange;

    emit SymbolInfoUpdated(
      symbolId,
      oldSymbol,
      oldExchange,
      newSymbol,
      newExchange
    );
  }

  /**
   * @dev Update symbol Id for a position token
   * @param tokenId token id of position
   * @param newSymbolId new symbol id for the position
   */
  function updateSymbolIdForPosition(
    uint tokenId,
    uint newSymbolId
  ) external onlyController {
    if (_ownerOf[tokenId] == address(0)) revert InvalidPositionTokenId();
    if (newSymbolId >= nextSymbolId) revert InvalidSymbolId();
    if (positionDeletionInProgress[tokenId])
      revert PositionDeletionInProgress();

    PositionDetails storage positionDetail = positionDetails[tokenId];

    // If updating to same symbolId, emit event and return
    if (positionDetail.symbolId == newSymbolId) {
      emit SymbolIdUpdated(tokenId, positionDetail.symbolId, newSymbolId);
      return;
    }

    bytes32 casKeyNew = keccak256(
      abi.encode(
        positionDetail.clearingFirm,
        positionDetail.accountNumber,
        newSymbolId
      )
    );

    if (casToTokenId[casKeyNew] != 0) revert AlreadyExists();

    bytes32 casKeyPrev = keccak256(
      abi.encode(
        positionDetail.clearingFirm,
        positionDetail.accountNumber,
        positionDetail.symbolId
      )
    );

    casToTokenId[casKeyPrev] = 0;
    casToTokenId[casKeyNew] = tokenId;

    uint oldSymbolId = positionDetails[tokenId].symbolId;
    positionDetails[tokenId].symbolId = newSymbolId;

    emit SymbolIdUpdated(tokenId, oldSymbolId, newSymbolId);
  }

  /**
   * @dev Get position ids by clearing firm and account number - O(k) using reverse mapping
   * @param clearingFirm_ clearing firm
   * @param accountNumber_ account number
   * @param includeExpiredPosition_ flag to include expired positions
   */
  function getPositionIdsByAccount(
    string memory clearingFirm_,
    string memory accountNumber_,
    bool includeExpiredPosition_
  ) public view override returns (uint[] memory) {
    bytes32 accountKey = keccak256(abi.encode(clearingFirm_, accountNumber_));
    uint[] memory allPositions = accountToPositionIds[accountKey];

    if (includeExpiredPosition_) {
      return allPositions;
    }

    // Filter out expired positions
    uint length = 0;
    for (uint i = 0; i < allPositions.length; i++) {
      if (!positionDetails[allPositions[i]].expired) {
        length++;
      }
    }

    uint[] memory result = new uint[](length);
    uint idx = 0;
    for (uint i = 0; i < allPositions.length; i++) {
      if (!positionDetails[allPositions[i]].expired) {
        result[idx] = allPositions[i];
        idx++;
      }
    }
    return result;
  }

  /**
   * @dev Get paginated positions
   * @param includeExpiredPosition_ flag to include expired positions
   * @param startIndex_ starting index (1-based, must be >= 1)
   * @param limit_ number of positions to return (must be >= 1)
   */
  function getPositionsPaginated(
    bool includeExpiredPosition_,
    uint startIndex_,
    uint limit_
  ) public view returns (PositionDetails[] memory) {
    if (startIndex_ == 0) revert ZeroValue();
    if (limit_ == 0) revert ZeroValue();

    // Calculate how many positions to return
    uint endIndex = startIndex_ + limit_ - 1;
    if (endIndex > mintCounter) {
      endIndex = mintCounter;
    }

    // If startIndex is beyond mintCounter, return empty array
    if (startIndex_ > mintCounter) {
      return new PositionDetails[](0);
    }

    // Count how many positions match the filter
    uint count = 0;
    for (uint i = startIndex_; i <= endIndex; i++) {
      if (includeExpiredPosition_ || !positionDetails[i].expired) {
        count++;
      }
    }

    // Build result array
    PositionDetails[] memory result = new PositionDetails[](count);
    uint idx = 0;
    for (uint i = startIndex_; i <= endIndex; i++) {
      if (includeExpiredPosition_ || !positionDetails[i].expired) {
        result[idx] = positionDetails[i];
        idx++;
      }
    }

    return result;
  }

  function batchTransferFrom(
    address from,
    address to,
    uint[] memory tokenIds
  ) external onlyController {
    for (uint i = 0; i < tokenIds.length; i++) {
      safeTransferFrom(from, to, tokenIds[i]);
    }
  }

  /**
   * @dev transfer nft
   * @param from from address
   * @param to to address
   * @param id token id of nft to be transferred
   */
  function transferFrom(
    address from,
    address to,
    uint id
  ) public override(ERC721, IStrandsPosition) onlyController {
    if (_ownerOf[id] == address(0)) revert InvalidPositionTokenId();
    if (from != _ownerOf[id]) revert UnauthorizedOwner();
    if (to == address(0)) revert ZeroAddress();
    if (positionDeletionInProgress[id]) revert PositionDeletionInProgress();

    unchecked {
      _balanceOf[from]--;
      _balanceOf[to]++;
    }
    _ownerOf[id] = to;

    // Use O(1) index mapping to remove from old owner
    uint indexPlusOne = positionIndexByOwner[from][id];
    if (indexPlusOne > 0) {
      uint index = indexPlusOne - 1;
      uint lastTokenId = _ownedPositionIds[from][
        _ownedPositionIds[from].length - 1
      ];
      _ownedPositionIds[from][index] = lastTokenId;
      positionIndexByOwner[from][lastTokenId] = indexPlusOne; // Update swapped element's index
      _ownedPositionIds[from].pop();
      delete positionIndexByOwner[from][id];
    }

    // Add to new owner with index tracking
    _ownedPositionIds[to].push(id);
    positionIndexByOwner[to][id] = _ownedPositionIds[to].length;

    delete getApproved[id];
    emit Transfer(from, to, id);
  }

  /**
   * @dev Check if trade exists for a position
   * @param positionId position token ID
   * @param tradeId trade ID
   * @return exists true if trade exists for the position
   */
  function tradeIdExists(
    uint positionId,
    string calldata tradeId
  ) external view returns (bool exists) {
    return tradeIdIndex[positionId][tradeId] != 0;
  }

  /**
   * @dev Get owner token ids
   * @param target nft owner address
   */
  function getOwnerTokenIds(
    address target
  ) public view returns (uint256[] memory) {
    //Includes all tokens including expired ones
    return _ownedPositionIds[target];
  }

  /**
   * @dev Get token id
   * @param clearingFirm_ position clearing firm
   * @param accountNumber_ position account number
   * @param symbol_ position symbol name
   * @param exchange_ position exchange name
   */
  function getTokenId(
    string memory clearingFirm_,
    string memory accountNumber_,
    string memory symbol_,
    string memory exchange_
  ) public view returns (uint) {
    uint symbolId = _getSymbolId(symbol_, exchange_);
    bytes32 casKey = keccak256(
      abi.encode(clearingFirm_, accountNumber_, symbolId)
    );
    return casToTokenId[casKey];
  }

  /**
   * @dev Mark the position where expiration date passed as expired
   * @param tokenId_ token id of position to be expired
   */
  function _expirePosition(uint tokenId_) internal {
    address tokenOwner = _ownerOf[tokenId_];
    if (tokenOwner == address(0)) revert InvalidPositionTokenId();
    if (positionDeletionInProgress[tokenId_])
      revert PositionDeletionInProgress();
    if (positionDetails[tokenId_].lastTradingDate >= block.timestamp)
      revert BeforeLastTradingDate();

    positionDetails[tokenId_].expired = true;

    emit PositionExpired(tokenOwner, tokenId_);
  }

  /**
   * @dev Burn nft - O(1) using index mapping
   * @param tokenId_ token id of nft to be burned
   */
  function burn(uint tokenId_) internal {
    address tokenOwner = _ownerOf[tokenId_];
    _burn(tokenId_);

    // Use O(1) index mapping to remove from owner array
    uint indexPlusOne = positionIndexByOwner[tokenOwner][tokenId_];
    if (indexPlusOne > 0) {
      uint index = indexPlusOne - 1;
      uint lastTokenId = _ownedPositionIds[tokenOwner][
        _ownedPositionIds[tokenOwner].length - 1
      ];
      _ownedPositionIds[tokenOwner][index] = lastTokenId;
      positionIndexByOwner[tokenOwner][lastTokenId] = indexPlusOne; // Update swapped element's index
      _ownedPositionIds[tokenOwner].pop();
      delete positionIndexByOwner[tokenOwner][tokenId_];
    }
  }

  /**
   * @dev Get SymbolId, create if doesnt exist
   * @param symbol_ symbol name
   * @param exchange_ exchange of the symbol
   */
  function _getOrCreateSymbolId(
    string memory symbol_,
    string memory exchange_
  ) private returns (uint256) {
    uint symbolId = _getSymbolId(symbol_, exchange_);
    if (symbolId == 0) {
      bytes32 symbolKey = keccak256(abi.encode(symbol_, exchange_));
      symbolToSymbolId[symbolKey] = nextSymbolId;
      symbolIdToSymbol[nextSymbolId].symbol = symbol_;
      symbolIdToSymbol[nextSymbolId].exchange = exchange_;
      nextSymbolId++;
    }
    return _getSymbolId(symbol_, exchange_);
  }

  function _getSymbolId(
    string memory symbol_,
    string memory exchange_
  ) internal view returns (uint) {
    bytes32 symbolKey = keccak256(abi.encode(symbol_, exchange_));
    return symbolToSymbolId[symbolKey];
  }

  /**
   * @dev string compare
   * @param str1 first string
   * @param str2 second string
   */
  function _stringCompare(
    string memory str1,
    string memory str2
  ) internal pure returns (bool) {
    if (bytes(str1).length != bytes(str2).length) {
      return false;
    }
    return keccak256(bytes(str1)) == keccak256(bytes(str2));
  }

  ///////////////// Getter Functions /////////////////
  function getCasToTokenId(bytes32 casKey) public view returns (uint) {
    return casToTokenId[casKey];
  }
}

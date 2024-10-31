// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ERC721} from "solmate/src/tokens/ERC721.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {StrandsOwned} from "../strands/StrandsOwned.sol";
import {IStrandsPosition} from "../interfaces/IStrandsPosition.sol";


contract StrandsPosition is ERC721, StrandsOwned, IStrandsPosition {
  uint public mintCounter;
  mapping(bytes32 => uint) public symbolToSymbolId; /// bytes32 = keccak256(abi.encode(symbol,exchange))
  mapping(uint => SymbolInfo) public symbolIdToSymbol;
  uint256 private nextSymbolId = 1;
  mapping(uint => SymbolInfo[]) public symbolIdToAltSymbols;
  mapping(string => TradeDetails) public trades;

  // private variables
  mapping(bytes32 => uint) private casToTokenId; /// bytes32 = keccak256(abi.encode(clearingFirm, accountNumber, symbolId))
  mapping(address => uint[]) private _ownedPositionIds; // Owner -> Owned Token Ids
  mapping(uint => PositionDetails) private positionDetails;
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
    require(
      (mintCounter == 0 || tokenId <= mintCounter),
      "can't get URI for nonexistent token"
    );
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
    require(_ownerOf[tokenId] != address(0), "Invalid position tokenId");
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
    uint symbolId = getOrCreateSymbolId(symbol_, exchange_);
    // Check NFT exists with same clearingFirm_ and accountNumber_ and symbol_

    bytes32 casKey = keccak256(
      abi.encode(clearingFirm_, accountNumber_, symbolId)
    );

    require(casToTokenId[casKey] == 0, "Position already exists, use addTrade");

    mintCounter += 1;
    // If we force it to be > 0, we can see if trades[tradeId] exists by checking if executionTime == 0
    require(tradeDetails_.executionTime > 0, "ExecutionTime cant be 0");
    trades[tradeDetails_.tradeId] = tradeDetails_;
    positionDetails[mintCounter].tradeIds.push(tradeDetails_.tradeId);
    positionDetails[mintCounter].symbolId = symbolId;
    positionDetails[mintCounter].clearingFirm = clearingFirm_;
    positionDetails[mintCounter].accountNumber = accountNumber_;
    positionDetails[mintCounter].lastTradingDate = lastTradingDate_;
    positionDetails[mintCounter].tokenId = mintCounter;
    positionDetails[mintCounter].expired = lastTradingDate_ < block.timestamp;

    casToTokenId[casKey] = mintCounter;

    _ownedPositionIds[to].push(mintCounter);
    _safeMint(to, mintCounter);

    emit PositionCreated(
      mintCounter,
      to,
      symbol_,
      exchange_,
      clearingFirm_,
      accountNumber_,
      lastTradingDate_
    );

    emit TradeAdded(
      mintCounter,
      tradeDetails_.tradeId,
      tradeDetails_.tag50,
      tradeDetails_.quantity,
      tradeDetails_.purchasePrice,
      tradeDetails_.executionTime,
      tradeDetails_.isLong
    );

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
    require(owner_ != address(0), "Invalid owner address");

    uint tokenId = getTokenId(
      clearingFirm_,
      accountNumber_,
      symbol_,
      exchange_
    );

    require(
      trades[tradeDetails_.tradeId].executionTime == 0,
      "Trade already exists"
    );

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
      require(ownerOf(tokenId) == owner_, "Not correct owner");

      // If we force it to be > 0, we can see if trades[tradeId] exists by checking if executionTime == 0
      require(tradeDetails_.executionTime > 0, "ExecutionTime cant be 0");
      trades[tradeDetails_.tradeId] = tradeDetails_;
      positionDetails[mintCounter].tradeIds.push(tradeDetails_.tradeId);
      emit TradeAdded(
        tokenId,
        tradeDetails_.tradeId,
        tradeDetails_.tag50,
        tradeDetails_.quantity,
        tradeDetails_.purchasePrice,
        tradeDetails_.executionTime,
        tradeDetails_.isLong
      );
    }
  }

  /**
   * @dev Delete trade
   * @param owner_ position owner address
   * @param tradeId_ trade id to delete
   * @param symbol_ position symbol name
   * @param exchange_ position exchange name
   * @param clearingFirm_ position clearing firm
   * @param accountNumber_ position account number
   */
  function deleteTrade(
    address owner_,
    string calldata tradeId_,
    string calldata symbol_,
    string calldata exchange_,
    string calldata clearingFirm_,
    string calldata accountNumber_
  ) external onlyController {
    // Check owner is address(0)
    require(owner_ != address(0), "Invalid owner address");

    (
      bool isPositionAvailable,
      bool isTradeIdAvailable,
      uint tokenId,
      address tokenOwner
    ) = tradeIdExists(
        symbol_,
        exchange_,
        clearingFirm_,
        accountNumber_,
        tradeId_
      );
    require(isPositionAvailable && isTradeIdAvailable, "Trade doesnt exist");
    require(owner_ == tokenOwner, "Not correct owner");

    string[] storage tradeIds = positionDetails[tokenId].tradeIds;
    if (tradeIds.length == 1) {
      deletePosition(tokenId);
    } else {
      (, uint index) = _tradeIdExists(tokenId, tradeId_);
      tradeIds[index] = tradeIds[tradeIds.length - 1];
    }
    tradeIds.pop();
    delete trades[tradeId_];
    emit TradeDeleted(tokenId, tradeId_);
  }

  /**
   * @dev Delete positions
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
    burn(tokenId);
    emit PositionDeleted(tokenId);
    PositionDetails storage positionDetail = positionDetails[tokenId];
    bytes32 casKey = keccak256(
      abi.encode(
        positionDetail.clearingFirm,
        positionDetail.accountNumber,
        positionDetail.symbolId
      )
    );
    casToTokenId[casKey] = 0;
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
   * @dev Update symbol+source for symbolId
   * @param symbolId symbol id that needs to be udpated
   * @param altSymbols new symbol for the id
   */
  function updateAltSymbolsForSymbolId(
    uint symbolId,
    SymbolInfo[] memory altSymbols
  ) external onlyController {
    require(symbolId < nextSymbolId, "Invalid symbolId");
    symbolIdToAltSymbols[symbolId] = altSymbols;
  }

  /**
   * @dev Update symbol+source for symbolId
   * @param symbolId symbol id that needs to be udpated
   * @param newSymbol new symbol for the id
   * @param newSource new source for the id
   */
  function updateInfoForSymbolId(
    uint symbolId,
    string memory newSymbol,
    string memory newSource
  ) external onlyController {
    require(symbolId < nextSymbolId, "Invalid symbolId");
    require(bytes(newSymbol).length > 0, "New symbol can't be blank");
    require(bytes(newSource).length > 0, "New source can't be blank");
    bytes32 newSymbolKey = keccak256(abi.encode(newSymbol, newSource));
    require(
      symbolToSymbolId[newSymbolKey] == 0,
      "New symbol and source already exist for another symbolId"
    );

    bytes32 oldSymbolKey = keccak256(
      abi.encode(
        symbolIdToSymbol[symbolId].symbol,
        symbolIdToSymbol[symbolId].source
      )
    );

    delete symbolToSymbolId[oldSymbolKey];
    symbolToSymbolId[newSymbolKey] = symbolId;
    symbolIdToSymbol[symbolId].symbol = newSymbol;
    symbolIdToSymbol[symbolId].source = newSource;
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
    PositionDetails storage positionDetail = positionDetails[tokenId];

    bytes32 casKeyNew = keccak256(
      abi.encode(
        positionDetail.clearingFirm,
        positionDetail.accountNumber,
        newSymbolId
      )
    );

    require(
      casToTokenId[casKeyNew] == 0,
      "Clashing clearingFirm+accountNumber+symbolId with another position"
    );

    bytes32 casKeyPrev = keccak256(
      abi.encode(
        positionDetail.clearingFirm,
        positionDetail.accountNumber,
        positionDetail.symbolId
      )
    );

    casToTokenId[casKeyPrev] = 0;
    casToTokenId[casKeyNew] = tokenId;

    positionDetails[tokenId].symbolId = newSymbolId;
  }

  /**
   * @dev Get position ids by clearing firm and account number
   * @param clearingFirm_ clearing firm
   * @param accountNumber_ account number
   * @param includeExpiredPosition_ flag to include expired positions
   */
  function getPositionIdsByAccount(
    string memory clearingFirm_,
    string memory accountNumber_,
    bool includeExpiredPosition_
  ) public view override returns (uint[] memory) {
    uint length;
    uint i;
    bool[] memory flag = new bool[](mintCounter + 1);

    for (i = 1; i <= mintCounter; ) {
      if (
        _stringCompare(clearingFirm_, positionDetails[i].clearingFirm) &&
        _stringCompare(accountNumber_, positionDetails[i].accountNumber) &&
        (positionDetails[i].expired == false || includeExpiredPosition_)
      ) {
        flag[i] = true;
        ++length;
      }
      unchecked {
        ++i;
      }
    }

    uint[] memory result = new uint[](length);
    uint id = 0;
    for (i = 1; i <= mintCounter; ) {
      if (flag[i]) {
        result[id] = positionDetails[i].tokenId;
        ++id;
      }
      unchecked {
        ++i;
      }
    }
    return result;
  }

  /**
   * @dev Get positions by clearing firm and account number
   * @param clearingFirm_ clearing firm
   * @param accountNumber_ account number
   * @param includeExpiredPosition_ flag to include expired positions
   */
  function getPositionsByAccount(
    string memory clearingFirm_,
    string memory accountNumber_,
    bool includeExpiredPosition_
  ) public view override returns (PositionDetails[] memory) {
    uint[] memory pids = getPositionIdsByAccount(
      clearingFirm_,
      accountNumber_,
      includeExpiredPosition_
    );

    PositionDetails[] memory result = new PositionDetails[](pids.length);
    for (uint i = 0; i < pids.length; i++) {
      result[i] = positionDetails[pids[i]];
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
    require(from == _ownerOf[id], "WRONG_FROM");
    require(to != address(0), "INVALID_RECIPIENT");

    unchecked {
      _balanceOf[from]--;
      _balanceOf[to]++;
    }
    _ownerOf[id] = to;
    uint length = _ownedPositionIds[from].length;
    for (uint i = 0; i < length; ) {
      if (id == _ownedPositionIds[from][i]) {
        _ownedPositionIds[from][i] = _ownedPositionIds[from][length - 1];
        _ownedPositionIds[from].pop();
        break;
      }
      unchecked {
        ++i;
      }
    }
    _ownedPositionIds[to].push(id);

    delete getApproved[id];
    emit Transfer(from, to, id);
  }

  /**
   * @dev check trade id exists for
   * @param symbol_ position symbol name
   * @param exchange_ position exchange name
   * @param clearingFirm_ position clearing firm
   * @param accountNumber_ position account number
   * @param tradeId_ trade id
   */
  function tradeIdExists(
    string calldata symbol_,
    string calldata exchange_,
    string calldata clearingFirm_,
    string calldata accountNumber_,
    string calldata tradeId_
  ) public view returns (bool, bool, uint256, address) {
    uint tokenId = getTokenId(
      clearingFirm_,
      accountNumber_,
      symbol_,
      exchange_
    );

    if (tokenId == 0 || trades[tradeId_].executionTime == 0) {
      return (false, false, 0, address(0));
    } else {
      (bool _exist, ) = _tradeIdExists(tokenId, tradeId_);
      return (true, _exist, tokenId, ownerOf(tokenId));
    }
  }

  /**
   * @dev Get owned positions
   * @param target owner address
   */
  function getOwnerPositions(
    address target
  ) public view returns (PositionDetails[] memory) {
    //Only return unexpired positions
    uint length = _ownedPositionIds[target].length;
    uint resultLength;
    for (uint i = 0; i < length; ++i) {
      if (positionDetails[_ownedPositionIds[target][i]].expired == false) {
        resultLength += 1;
      }
    }

    PositionDetails[] memory result = new PositionDetails[](resultLength);
    uint idx = 0;
    for (uint i = 0; i < length; ++i) {
      if (positionDetails[_ownedPositionIds[target][i]].expired == false) {
        result[idx] = positionDetails[_ownedPositionIds[target][i]];
        ++idx;
      }
    }
    return result;
  }

  /**
   * @dev get all positions
   * @param includeExpiredPosition_ flag to include expired positions
   */
  function getAllPositions(
    bool includeExpiredPosition_
  ) public view returns (PositionDetails[] memory) {
    if (includeExpiredPosition_) {
      PositionDetails[] memory _result = new PositionDetails[](mintCounter);
      for (uint i = 1; i <= mintCounter; ++i) {
        _result[i - 1] = positionDetails[i];
      }

      return _result;
    }

    uint resultLength;
    for (uint i = 1; i <= mintCounter; ++i) {
      if (positionDetails[i].expired == false) {
        ++resultLength;
      }
    }

    PositionDetails[] memory result = new PositionDetails[](resultLength);
    uint idx = 0;
    for (uint i = 1; i <= mintCounter; ++i) {
      if (positionDetails[i].expired == false) {
        result[idx] = positionDetails[i];
        ++idx;
      }
    }

    return result;
  }

  /**
   * @dev get trades between from and to time
   * @param fromTime trade from time
   * @param toTime trade to time
   */
  function getTradesBetween(
    uint fromTime,
    uint toTime
  ) external view returns (TradeDetails[] memory) {
    PositionDetails[] memory unexpiredPositions = getAllPositions(false);
    uint resultLength;

    for (uint i = 0; i < unexpiredPositions.length; ++i) {
      string[] memory tradeIds = unexpiredPositions[i].tradeIds;
      for (uint j = 0; j < tradeIds.length; ++j) {
        if (
          fromTime < trades[tradeIds[j]].executionTime &&
          trades[tradeIds[j]].executionTime < toTime
        ) {
          ++resultLength;
        }
      }
    }

    TradeDetails[] memory result = new TradeDetails[](resultLength);
    uint idx;
    for (uint i = 0; i < unexpiredPositions.length; ++i) {
      string[] memory tradeIds = unexpiredPositions[i].tradeIds;
      for (uint j = 0; j < tradeIds.length; ++j) {
        if (
          fromTime < trades[tradeIds[j]].executionTime &&
          trades[tradeIds[j]].executionTime < toTime
        ) {
          result[idx] = trades[tradeIds[j]];
          ++idx;
        }
      }
    }

    return result;
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
    require(
      positionDetails[tokenId_].lastTradingDate < block.timestamp,
      "before lastTradingDate"
    );

    address tokenOwner = _ownerOf[tokenId_];
    positionDetails[tokenId_].expired = true;

    emit PositionExpired(tokenOwner, tokenId_);
  }

  /**
   * @dev Burn nft
   * @param tokenId_ token id of nft to be burned
   */
  function burn(uint tokenId_) internal {
    address tokenOwner = _ownerOf[tokenId_];
    uint length = _ownedPositionIds[tokenOwner].length;
    _burn(tokenId_);
    for (uint i = 0; i < length; ) {
      if (tokenId_ == _ownedPositionIds[tokenOwner][i]) {
        _ownedPositionIds[tokenOwner][i] = _ownedPositionIds[tokenOwner][
          length - 1
        ];
        _ownedPositionIds[tokenOwner].pop();
        break;
      }
      unchecked {
        ++i;
      }
    }
  }

  /**
   * @dev check trade id exists
   * @param tokenId_ token id
   * @param tradeId_ trade id
   */
  function _tradeIdExists(
    uint tokenId_,
    string memory tradeId_
  ) internal view returns (bool, uint) {
    string[] storage tradeIds = positionDetails[tokenId_].tradeIds;
    for (uint j = 0; j < tradeIds.length; ) {
      if (_stringCompare(tradeIds[j], tradeId_)) {
        return (true, j);
      }
      unchecked {
        ++j;
      }
    }
    return (false, 0);
  }

  /**
   * @dev Get SymbolId, create if doesnt exist
   * @param symbol_ symbol name
   * @param exchange_ exchange of the symbol
   */
  function getOrCreateSymbolId(
    string memory symbol_,
    string memory exchange_
  ) public returns (uint256) {
    uint symbolId = _getSymbolId(symbol_, exchange_);
    if (symbolId == 0) {
      bytes32 symbolKey = keccak256(abi.encode(symbol_, exchange_));
      symbolToSymbolId[symbolKey] = nextSymbolId;
      symbolIdToSymbol[nextSymbolId].symbol = symbol_;
      symbolIdToSymbol[nextSymbolId].source = exchange_;
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
  function GetSymbolIdToAltSymbol(
    uint symbolId
  ) public view returns (SymbolInfo[] memory) {
    return symbolIdToAltSymbols[symbolId];
  }

  function getCasToTokenId(bytes32 casKey) public view returns (uint) {
    return casToTokenId[casKey];
  }
}

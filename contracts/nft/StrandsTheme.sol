// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ERC721} from "solmate/src/tokens/ERC721.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {StrandsOwned} from "../strands/StrandsOwned.sol";
import {DefaultOperatorFilterer} from "operator-filter-registry/src/DefaultOperatorFilterer.sol";

contract StrandsTheme is ERC721, DefaultOperatorFilterer, StrandsOwned {
  struct ThemeState {
    address[] portfolioWallets;
    mapping(bytes32 => bytes32) state;
  }

  uint public mintCounter;
  string tURI;
  mapping(uint256 => ThemeState) private themeInfo;
  mapping(uint256 => bytes32[]) private fieldNames;
  mapping(address => uint[]) private _ownedTokenIds; // Owner -> Owned Token Ids
  mapping(uint256 => string) private themeName;

  constructor(string memory _name, string memory _symbol, string memory _tURI) 
    ERC721(_name, _symbol)
    StrandsOwned(msg.sender, msg.sender) {
    tURI = _tURI;
  }

  function tokenURI(uint tokenId) public view override(ERC721) returns (string memory) {
    require((mintCounter == 0 || tokenId <= mintCounter), "can't get URI for nonexistent token");
    return tURI;
  }

  function setTokenURI(uint tokenId, string memory _tURI) public onlyController {
    require((mintCounter == 0 || tokenId <= mintCounter), "can't set URI for nonexistent token");
    tURI = _tURI;
  }

  function mint(address to, string memory themeName_) public onlyController {
    mintCounter += 1;
    _ownedTokenIds[to].push(mintCounter);
    themeName[mintCounter] = themeName_;

    _safeMint(to, mintCounter);
  }

  function get(uint256 tokenId, bytes32 fieldName) public view returns (bytes32) {
    return themeInfo[tokenId].state[fieldName];
  }

  function getAllFieldNames(uint256 tokenId) public view returns (bytes32[] memory) {
    return fieldNames[tokenId];
  }

  function getAllFields(uint256 tokenId) public view returns (bytes32[] memory, bytes32[] memory) {
    uint256 length = fieldNames[tokenId].length;
    bytes32[] memory values = new bytes32[](length);

    for (uint256 i = 0; i < length; ) {
      values[i] = themeInfo[tokenId].state[fieldNames[tokenId][i]];
      unchecked {
        ++i;
      }
    }
    return (fieldNames[tokenId], values);
  }

  function getOwnerTokens(address owner_) public view returns (uint256[] memory) {
    return _ownedTokenIds[owner_];
  }

  function getThemeName(uint256 tokenId) public view returns (string memory) {
    return themeName[tokenId];
  }

  function set(uint256 tokenId, bytes32 fieldName, bytes32 value) public {
    require(isController(msg.sender) || msg.sender == _ownerOf[tokenId], "No Permission");

    themeInfo[tokenId].state[fieldName] = value;
    fieldNames[tokenId].push(fieldName);
  }

  function setThemeName(uint256 tokenId, string memory themeName_) external {
    require(isController(msg.sender) || msg.sender == _ownerOf[tokenId], "No Permission");

    themeName[tokenId] = themeName_;
  }

  function setPortfolioWallets(uint256 tokenId, address[] calldata wallets) public {
    require(isController(msg.sender) || msg.sender == _ownerOf[tokenId], "No Permission");

    themeInfo[tokenId].portfolioWallets = wallets;
  }

  function getPortfolioWallets(uint256 tokenId) public view returns (address[] memory) {
    return themeInfo[tokenId].portfolioWallets;
  }

  function transferFrom(address from, address to, uint id) public override onlyAllowedOperator(from) {
    require(from == _ownerOf[id], "WRONG_FROM");
    require(to != address(0), "INVALID_RECIPIENT");
    require(
      isController(msg.sender) || msg.sender == from || isApprovedForAll[from][msg.sender] || msg.sender == getApproved[id],
      "NOT AUTHORIZED"
    );

    unchecked {
      _balanceOf[from]--;
      _balanceOf[to]++;
    }
    _ownerOf[id] = to;

    uint length = _ownedTokenIds[from].length;
    for (uint i = 0; i < length; ) {
      if (id == _ownedTokenIds[from][i]) {
        _ownedTokenIds[from][i] = _ownedTokenIds[from][length - 1];
        _ownedTokenIds[from].pop();
        break;
      }
      unchecked {
        ++i;
      }
    }
    _ownedTokenIds[to].push(id);

    delete getApproved[id];
    emit Transfer(from, to, id);
  }

  function safeTransferFrom(address from, address to, uint id) public override onlyAllowedOperator(from) {
    super.safeTransferFrom(from, to, id);
  }

  function safeTransferFrom(
    address from,
    address to,
    uint id,
    bytes calldata data
  ) public override onlyAllowedOperator(from) {
    super.safeTransferFrom(from, to, id, data);
  }

  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return super.supportsInterface(interfaceId);
  }

  function setApprovalForAll(address operator, bool approved) public override onlyAllowedOperatorApproval(operator) {
    super.setApprovalForAll(operator, approved);
  }

  function approve(address operator, uint tokenId) public override onlyAllowedOperatorApproval(operator) {
    super.approve(operator, tokenId);
  }
}

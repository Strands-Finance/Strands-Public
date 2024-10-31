// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {StrandsOwned} from "../strands/StrandsOwned.sol";
import {ERC721} from "solmate/src/tokens/ERC721.sol";
import {DefaultOperatorFilterer} from "operator-filter-registry/src/DefaultOperatorFilterer.sol";

contract StrandsDev is ERC721, DefaultOperatorFilterer, StrandsOwned {
  uint256 public mintCounter;
  string tURI;

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

  function mint(address to) public onlyController {
    mintCounter += 1;
    _safeMint(to, mintCounter);
  }

  function transferFrom(address from, address to, uint256 id) public override onlyAllowedOperator(from) {
    require(from == _ownerOf[id], "WRONG_FROM");
    require(to != address(0), "INVALID_RECIPIENT");

    require(
      isController(msg.sender) || msg.sender == from || isApprovedForAll[from][msg.sender] || msg.sender == getApproved[id],
      "NOT_AUTHORIZED"
    );

    unchecked {
      _balanceOf[from]--;
      _balanceOf[to]++;
    }

    _ownerOf[id] = to;

    delete getApproved[id];

    emit Transfer(from, to, id);
  }

  function safeTransferFrom(address from, address to, uint256 id) public override onlyAllowedOperator(from) {
    super.safeTransferFrom(from, to, id);
  }

  function safeTransferFrom(
    address from,
    address to,
    uint256 id,
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

  function approve(address operator, uint256 tokenId) public override onlyAllowedOperatorApproval(operator) {
    super.approve(operator, tokenId);
  }
}

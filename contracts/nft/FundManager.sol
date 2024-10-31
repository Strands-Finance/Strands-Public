// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ERC721} from "solmate/src/tokens/ERC721.sol";
import {StrandsOwned} from "../strands/StrandsOwned.sol";
import {DefaultOperatorFilterer} from "operator-filter-registry/src/DefaultOperatorFilterer.sol";

contract FundManager is ERC721, StrandsOwned {
  uint public mintCounter;
  uint public cumulativeUserBase;
  uint public NAV;
  uint public numOfShares;
  bool individualize;
  string tURI;

  constructor(
    string memory _name,
    string memory _symbol,
    string memory _tURI
  ) ERC721(_name, _symbol) StrandsOwned(msg.sender, msg.sender) {
    tURI = _tURI;
  }

  function tokenURI(
    uint tokenId
  ) public view override(ERC721) returns (string memory) {
    require(
      (mintCounter == 0 || tokenId <= mintCounter),
      "can't get URI for nonexistent token"
    );
    return tURI;
  }

  function setTokenURI(
    uint tokenId,
    string memory _tURI
  ) public onlyController {
    require(
      (mintCounter == 0 || tokenId <= mintCounter),
      "can't set URI for nonexistent token"
    );
    tURI = _tURI;
  }

  function setCumulativeUserBase(uint _cub) public {
    require(balanceOf(msg.sender) > 0, "NOT AUTHORIZED");
    cumulativeUserBase = _cub;
  }

  function setNAV(uint _nav) public {
    require(balanceOf(msg.sender) > 0, "NOT AUTHORIZED");
    NAV = _nav;
  }

  function setName(uint _name) public {
    require(balanceOf(msg.sender) > 0, "NOT AUTHORIZED");
    NAV = _name;
  }

  function setNumOfShares(uint _shares) public {
    require(balanceOf(msg.sender) > 0, "NOT AUTHORIZED");
    numOfShares = _shares;
  }

  function mint(address to) public onlyController {
    mintCounter += 1;
    _safeMint(to, mintCounter);
  }

  function transferFrom(address from, address to, uint id) public override {
    require(from == _ownerOf[id], "WRONG_FROM");
    require(to != address(0), "INVALID_RECIPIENT");

    if (msg.sender != _ownerOf[id]) {
      require(
        isController(msg.sender) ||
          msg.sender == from ||
          isApprovedForAll[from][msg.sender] ||
          msg.sender == getApproved[id],
        "NOT AUTHORIZED"
      );
    }

    unchecked {
      _balanceOf[from]--;
      _balanceOf[to]++;
    }

    _ownerOf[id] = to;

    delete getApproved[id];

    emit Transfer(from, to, id);
  }
}

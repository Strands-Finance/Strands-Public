// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ERC721} from "solmate/src/tokens/ERC721.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {StrandsOwned} from "../strands/StrandsOwned.sol";

contract S1Position is ERC721, StrandsOwned {
  uint public mintCounter;
  string tURI;
  mapping(uint => uint) private positionDetails;

  constructor(string memory _name, string memory _symbol, string memory _tURI)
    ERC721(_name, _symbol)
    StrandsOwned(msg.sender, msg.sender) {
    tURI = _tURI;
  }

  function tokenURI(uint tokenId) public view override(ERC721) returns (string memory) {
    require((mintCounter == 0 || tokenId <= mintCounter), "can't get URI for nonexistent token");
    return tURI;
  }

  function setValue(uint tokenId, uint _value) public onlyController {
    positionDetails[tokenId] = _value;
  }

  function getValue(uint tokenId) public view returns (uint) {
    return positionDetails[tokenId];
  }

  function setTokenURI(uint tokenId, string memory _tURI) public onlyController {
    require((mintCounter == 0 || tokenId <= mintCounter), "can't set URI for nonexistent token");
    tURI = _tURI;
  }

  function mint(address to, uint _value) public onlyController {
    mintCounter += 1;
    positionDetails[mintCounter] = _value;
    _safeMint(to, mintCounter);
  }

  function transferFrom(address from, address to, uint id) public override {
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
    delete getApproved[id];
    emit Transfer(from, to, id);
  }

  function getOwnerPositions(address target) external view returns (uint[] memory) {
    uint balance = balanceOf(target);
    uint[] memory result = new uint[](balance);
    uint j = 0;
    for (uint i = 1; i <= mintCounter; ++i) {
      if (_ownerOf[i] == target) {
        result[j] = positionDetails[i];
        j++;
      }
    }
    return result;
  }
}

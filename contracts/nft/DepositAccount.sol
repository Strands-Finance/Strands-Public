// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ERC721} from "solmate/src/tokens/ERC721.sol";
import {StrandsOwned} from "../strands/StrandsOwned.sol";

contract DepositAccount is ERC721, StrandsOwned {
  struct AccountDetails {
    string bank;
    string accountNumber;
    uint balance;
    uint statementTimestamp;
  }
  uint public mintCounter;
  string tURI;
  mapping(uint => AccountDetails) private accountDetails;
  mapping(address => uint[]) private _ownedAccountIds;
  mapping(bytes32 => uint) private hashMap;

  constructor(string memory _name, string memory _symbol, string memory _tURI) ERC721(_name, _symbol) StrandsOwned(msg.sender, msg.sender){
    tURI = _tURI;
  }

  function tokenURI(uint tokenId) public view override(ERC721) returns (string memory) {
    require((mintCounter == 0 || tokenId <= mintCounter), "can't get URI for nonexistent token");
    return tURI;
  }

  function getTokenId(string memory bank_, string memory accountNumber_) public view returns (uint) {
    bytes32 hashMapKey = keccak256(abi.encodePacked(bank_, accountNumber_));
    return hashMap[hashMapKey];
  }

  function setBalance(
    string memory bank_,
    string memory accountNumber_,
    uint _value,
    uint timestamp
  ) public onlyController {
    uint tokenId = getTokenId(bank_, accountNumber_);
    require(timestamp > accountDetails[mintCounter].statementTimestamp, "timestamp not newer than existing");
    accountDetails[tokenId].balance = _value;
    accountDetails[mintCounter].statementTimestamp = timestamp;
  }

  function getBalance(string memory bank_, string memory accountNumber_) public view returns (uint) {
    uint tokenId = getTokenId(bank_, accountNumber_);
    return accountDetails[tokenId].balance;
  }

  function setTokenURI(uint tokenId, string memory _tURI) public onlyController {
    require((mintCounter == 0 || tokenId <= mintCounter), "can't set URI for nonexistent token");
    tURI = _tURI;
  }

  function mint(
    address to,
    string memory bank_,
    string memory accountNumber_,
    uint balance_,
    uint timestamp
  ) public onlyController {
    bytes32 hashMapKey = keccak256(abi.encodePacked(bank_, accountNumber_));
    require(hashMap[hashMapKey] == 0, "NFT already exists");
    mintCounter += 1;

    accountDetails[mintCounter].bank = bank_;
    accountDetails[mintCounter].accountNumber = accountNumber_;
    accountDetails[mintCounter].balance = balance_;
    accountDetails[mintCounter].statementTimestamp = timestamp;

    hashMap[hashMapKey] = mintCounter;
    _ownedAccountIds[to].push(mintCounter);
    _safeMint(to, mintCounter);
  }

  function transferFrom(address from, address to, uint256 id) public override onlyController {
    require(from == _ownerOf[id], "WRONG_FROM");
    require(to != address(0), "INVALID_RECIPIENT");

    unchecked {
      _balanceOf[from]--;
      _balanceOf[to]++;
    }

    _ownerOf[id] = to;

    _updateOwnedTokenIds(from, to, id);
    delete getApproved[id];

    emit Transfer(from, to, id);
  }

  function getOwnerAccount(address target) public view returns (uint[] memory) {
    return _ownedAccountIds[target];
  }

  function getTotalBalance() public view returns (uint totalBalance) {
    for (uint i = 1; i <= mintCounter; ++i) {
      totalBalance += accountDetails[i].balance;
    }
  }

  function getOwnerAccountDetails(address target) public view returns (AccountDetails[] memory) {
    uint length = _ownedAccountIds[target].length;
    AccountDetails[] memory result = new AccountDetails[](length);
    for (uint i = 0; i < length; ++i) {
      result[i] = accountDetails[_ownedAccountIds[target][i]];
    }
    return result;
  }

  function _updateOwnedTokenIds(address from, address to, uint256 id) internal {
    uint length = _ownedAccountIds[from].length;
    for (uint i = 0; i < length; ) {
      if (id == _ownedAccountIds[from][i]) {
        _ownedAccountIds[from][i] = _ownedAccountIds[from][length - 1];
        _ownedAccountIds[from].pop();
        break;
      }
      unchecked {
        ++i;
      }
    }
    _ownedAccountIds[to].push(id);
  }
}

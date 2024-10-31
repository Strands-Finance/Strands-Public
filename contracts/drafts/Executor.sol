// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.20;

// This contract would be a multisig wallet or any other contract
// left blank for simplicity,
import "../strands/StrandsOwned.sol";

contract Executor is StrandsOwned {
  // contract code here
  constructor() StrandsOwned(msg.sender, msg.sender) {}

  function execute(
    address to,
    uint value,
    bytes memory _data
  ) external onlyOwner {
    // execute code here
    (bool success, ) = address(to).call{value: value}(_data);
    require(success, "tx failed");
  }
}

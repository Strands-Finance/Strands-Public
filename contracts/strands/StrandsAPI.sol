// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../strands/StrandsOwned.sol";

//ERC20 to represent the USD in off chain account
contract StrandsAPI is ERC20, StrandsOwned {
  constructor(
    address _owner,
    address _controller
  ) ERC20("Strands API", "Strands.api") StrandsOwned(_owner, _controller) {}

  function decimals() public view virtual override returns (uint8) {
    return 6;
  }

  function mint(address to, uint256 amount) public onlyController {
    _mint(to, amount);
  }

  function burn(uint256 amount) public onlyController {
    _burn(_msgSender(), amount);
  }

  function ownerBurn(address from, uint256 amount) public onlyOwner {
    _burn(from, amount);
  }
}

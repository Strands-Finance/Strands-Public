// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "../strands/StrandsOwned.sol";
import "./GateKeeper.sol";
import "../interfaces/IERC721.sol";
import { CallBackExclusive } from "./CallBackExclusive.sol";

/**
 * @dev GateKeeper for repository systems where users need to KYC, deposit gated by holding certain NFT
 */
contract NFTGateKeeper is GateKeeper, CallBackExclusive {
  address public nftCollectionAddress;
  /////////////
  // Events ///
  /////////////
  event NFTCollectionAddressUpdated(address newAddress);

  constructor(address nftCollectionAddress_) {
    require(nftCollectionAddress_ != address(0), "Invalid NFT address");
    nftCollectionAddress = nftCollectionAddress_;
  }

  function canDeposit(address user) external view override returns (bool) {
    if (depositWhitelistEnabled) {
      return IERC721(nftCollectionAddress).balanceOf(user) > 0;
    }
    return true;
  }

  ///////////////////////////
  // Controller Functions ///
  ///////////////////////////
  function updateNftCollectionAddress(
    address nftCollectionAddress_
  ) external onlyController {
    require(nftCollectionAddress_ != address(0), "Invalid NFT address");
    nftCollectionAddress = nftCollectionAddress_;

    emit NFTCollectionAddressUpdated(nftCollectionAddress_);
  }
}
//SPDX-License-Identifier: ISC

/**************************************************************
 * ░██████╗████████╗██████╗░░█████╗░███╗░░██╗██████╗░░██████╗ *
 * ██╔════╝╚══██╔══╝██╔══██╗██╔══██╗████╗░██║██╔══██╗██╔════╝ *
 * ╚█████╗░░░░██║░░░██████╔╝███████║██╔██╗██║██║░░██║╚█████╗░ *
 * ░╚═══██╗░░░██║░░░██╔══██╗██╔══██║██║╚████║██║░░██║░╚═══██╗ *
 * ██████╔╝░░░██║░░░██║░░██║██║░░██║██║░╚███║██████╔╝██████╔╝ *
 * ╚═════╝░░░░╚═╝░░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═════╝░╚═════╝░ *
 **************************************************************/

pragma solidity ^0.8.20;

import {Repository} from "./Repository.sol";
import {IRepositoryFactory} from "./interfaces/IRepositoryFactory.sol";
import "./strands/StrandsOwned.sol";

contract RepositoryFactory is IRepositoryFactory, StrandsOwned {
  mapping(uint => Repository) public deployedRepositories;
  uint public repositoryCount; // To keep track of the number of repositories

  address public feeRecipient; // licensing fee recipient
  address public WETH;

  constructor(
    address _owner,
    address _controller,
    address _weth
  ) StrandsOwned(_owner, _controller) {
    feeRecipient = _owner;
    WETH = _weth;
  }

  function createRepository(
    address _owner,
    address _controller
  ) external onlyController returns(address) {
    Repository newRepository = new Repository(
      _owner,
      _controller
    );

    deployedRepositories[repositoryCount] = newRepository;

    emit RepositoryCreated(address(newRepository), msg.sender, repositoryCount);

    repositoryCount++; // Increment the count
    return address(newRepository); // returns the corresponding index
  }

  function collectFeeFromRepository(uint index) external onlyController {
    deployedRepositories[index].collectLicensingFee();
  }

  function collectFeesFromRepositories(
    uint[] memory indexes
  ) external onlyController {
    for (uint i = 0; i < indexes.length; i++) {
      if (indexes[i] < repositoryCount) {
        deployedRepositories[indexes[i]].collectLicensingFee();
      }
    }
  }

  function setFeeRecipient(address _feeRecipient) external onlyOwner {
     if (_feeRecipient == address(0)) {
      revert InvalidRecipient();
    }

    feeRecipient = _feeRecipient;
    emit FeeRecipientSet(feeRecipient);
  }

  function removeRepository(uint index) external onlyController {
    if (index >= repositoryCount) {
      revert IndexOutOfBounds(index);
    }

    Repository removedRepository = deployedRepositories[index];
    removedRepository.collectLicensingFee();

    if (index < repositoryCount - 1) {
      deployedRepositories[index] = deployedRepositories[repositoryCount - 1]; // Swap with last entry
    }

    delete deployedRepositories[repositoryCount - 1]; // Remove last entry
    repositoryCount--; // Decrement the count

    emit RepositoryRemoved(address(removedRepository), index, address(0));
  }
}

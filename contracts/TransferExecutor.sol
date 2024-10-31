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

import "./strands/StrandsOwned.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IRepository} from "./interfaces/IRepository.sol";

contract TransferExecutor is StrandsOwned {
  using SafeERC20 for ERC20;

  address public depositToken;
  address public repositoryAddress;

  /////////////
  // EVENTS ///
  /////////////
  event FundsMovedFromExecutorToAddress(address recipient, uint amount);

  /////////////
  // ERRORS ///
  /////////////
  error RepositoryNotIntialized();
  error InvalidAddress();
  error InvalidAmount();

  constructor(
    address owner_,
    address controller_,
    address depositToken_
  ) StrandsOwned(owner_, controller_) {
    depositToken = depositToken_;
  }

  function initializeRepository(address repository_) external onlyController {
    if (repository_ == address(0)) {
      revert InvalidAddress();
    }
    repositoryAddress = repository_;
  }

  /**
   * @dev Transfer depositAsset from the Executor to EOA Wallet
   * @dev controller and executor can both call this function
   * @param amount the amount of depositAsset (following depositAsset decimal)
   * @param toAddress recipient address
   */
  function moveFundsFromRepositoryToWallet(
    uint amount,
    address toAddress
  ) external onlyController {
    if (repositoryAddress == address(0)) {
      revert RepositoryNotIntialized();
    }
    if (toAddress == address(0)) {
      revert InvalidAddress();
    }

    if (amount == 0) {
      revert InvalidAmount();
    }

    IRepository(repositoryAddress).moveFundsToExecutor(amount);

    ERC20(depositToken).transfer(toAddress, amount);

    emit FundsMovedFromExecutorToAddress(toAddress, amount);
  }
}

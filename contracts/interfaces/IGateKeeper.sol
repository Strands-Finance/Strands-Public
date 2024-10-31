// SPDX-License-Identifier: MIT

/**************************************************************
 * ░██████╗████████╗██████╗░░█████╗░███╗░░██╗██████╗░░██████╗ *
 * ██╔════╝╚══██╔══╝██╔══██╗██╔══██╗████╗░██║██╔══██╗██╔════╝ *
 * ╚█████╗░░░░██║░░░██████╔╝███████║██╔██╗██║██║░░██║╚█████╗░ *
 * ░╚═══██╗░░░██║░░░██╔══██╗██╔══██║██║╚████║██║░░██║░╚═══██╗ *
 * ██████╔╝░░░██║░░░██║░░██║██║░░██║██║░╚███║██████╔╝██████╔╝ *
 * ╚═════╝░░░░╚═╝░░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═════╝░╚═════╝░ *
 **************************************************************/

pragma solidity ^0.8.20;

interface IGateKeeper {
  /**
   * @dev Returns true if the user can deposit
   */
  function canDeposit(address user) external view returns (bool);
  
  /**
   * @dev Returns true if the user can transfer
   */
  function canTransferRepositoryToken(
    address user
  ) external view returns (bool);

}

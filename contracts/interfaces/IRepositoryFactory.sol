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

import {Repository} from "../Repository.sol";

interface IRepositoryFactory {
  /////////////
  // ERRORS ///
  /////////////
  error InvalidRecipient();
  error IndexOutOfBounds(uint index);

  /////////////
  // EVENTS ///
  /////////////
  event RepositoryCreated(
    address indexed repository,
    address indexed owner,
    uint indexed index
  );
  event FeeRecipientSet(address recipient);
  event RepositoryRemoved(
    address indexed repository,
    uint256 indexed index,
    address indexed newRepositoryAtIndex
  );
}

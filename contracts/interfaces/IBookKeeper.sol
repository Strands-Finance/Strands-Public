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

interface IBookKeeper {
  function getAUM() external view returns (uint);
  function getNAV() external view returns (uint);
  function getLastKnownAUM() external view returns (uint, uint);
  function getLastKnownNAV() external view returns (uint, uint);
  function isCapReached(uint plusAmount) external view returns (bool);
  function markValueOutsideRepositorySettled(
    bool _valueOutsideRepositorySettled
  ) external;
  function setAcceptableMarginOfError(uint _marginOfError) external;
  function checkExpectedNAV(uint expectedNAV) external view;

  /////////////
  // ERRORS ///
  /////////////
  error repositoryCannotBeZeroAddress();
  error OnlyRepositoryOrController();
  error OnlyRepositoryController(address repository, address caller);
  error ValueOutsideRepositoryNotSettled();
  error InconsistentNAV(uint currentNAV, uint expectedNAV);
}

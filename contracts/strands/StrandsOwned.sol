// SPDX-License-Identifier: MIT

/**************************************************************
 * ░██████╗████████╗██████╗░░█████╗░███╗░░██╗██████╗░░██████╗ *
 * ██╔════╝╚══██╔══╝██╔══██╗██╔══██╗████╗░██║██╔══██╗██╔════╝ *
 * ╚█████╗░░░░██║░░░██████╔╝███████║██╔██╗██║██║░░██║╚█████╗░ *
 * ░╚═══██╗░░░██║░░░██╔══██╗██╔══██║██║╚████║██║░░██║░╚═══██╗ *
 * ██████╔╝░░░██║░░░██║░░██║██║░░██║██║░╚███║██████╔╝██████╔╝ *
 * ╚═════╝░░░░╚═╝░░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═════╝░╚═════╝░ *
 **************************************************************/

pragma solidity 0.8.20;

import "../synthetix/AbstractOwned.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";


/**
 * @title StrandsOwned
 * @dev Modified version of the Owned contract that takes owner address as an argument in the constructor.
 */
contract StrandsOwned is AbstractOwned {
  using EnumerableSet for EnumerableSet.AddressSet;
  EnumerableSet.AddressSet private _controllers;

  constructor(address _owner, address _controller) {
    owner = _owner;
    _controllers.add(_controller);
    emit OwnerChanged(address(0), _owner);
  }

  /// @dev Set whether the given address is a controller or not
  /// @param _controller the address of the new controller
  /// @param isController_ flag to be controller or not
  function setIsController(
    address _controller,
    bool isController_
  ) external onlyOwner {
    if (isController_) {
      if (!_controllers.add(_controller)) {
        revert ControllerAlreadySet();
      }
    } else {
      _controllers.remove(_controller);
    }

    emit ControllerSet(_controller, isController_);
  }

  /// @dev Returns address is controller or not
  /// @param controller_ the address to check
  function isController(address controller_) public view returns (bool) {
    return _controllers.contains(controller_);
  }

  ///////////////
  // Modifiers //
  ///////////////
  modifier onlyController() {
    if (!_controllers.contains(msg.sender)) {
      revert OnlyController(address(this), msg.sender);
    }
    _;
  }

  //////////////
  // Events //
  ////////////
  event ControllerSet(address controller, bool isController);

  ////////////
  // ERRORS //
  ////////////
  error ControllerAlreadySet();
  error OnlyController(address thrower, address caller);
}

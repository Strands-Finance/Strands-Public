// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBookKeeper} from "../interfaces/IBookKeeper.sol";
import {IStrandsAccount} from "../interfaces/IStrandsAccount.sol";
import "../synthetix/Owned.sol";
import {Repository} from "../Repository.sol";
import {RepositoryToken} from "../RepositoryToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../libraries/SimpleInitializable.sol";
import {ConvertDecimals} from "../utils/ConvertDecimals.sol";
import "../synthetix/DecimalMath.sol";
import "../libraries/FixedPointMathLib.sol";
import {IDecimalMask} from "../interfaces/IDecimalMask.sol";

/// @dev Simple bookkeeper that where AUM = total depositAsset (minus pending deposits)
contract SimpleBookKeeper is IBookKeeper, Owned, SimpleInitializable {
  using DecimalMath for uint;

  Repository public repository;
  RepositoryToken private _repositoryToken;
  IERC20 private _depositAsset;
  uint8 private _depositDecimals;
  bool capReached = false;

  /// @dev acceptable margin of error between current vs expected NAV
  uint public acceptableMarginOfError = 0;

  constructor() Owned() {}

  /// @dev Initalizes the book keeper with the depositAsset feed data and the repository
  /// @param _repository the repository associated with this book keeper
  function init(address _repository) external onlyOwner initializer {
    if (address(_repository) == address(0))
      revert repositoryCannotBeZeroAddress();
    repository = Repository(_repository);
    require(
      address(repository.bookKeeper()) == address(this),
      "Wrong repository"
    );
    _repositoryToken = repository.repositoryToken();
    _depositAsset = repository.depositAsset();
    _depositDecimals = IDecimalMask(address(_depositAsset)).decimals();
  }

  /// @dev mark valueOutsideRepositorySettled to true
  /// @dev not used here
  function markValueOutsideRepositorySettled(
    bool _valueOutsideRepositorySettled
  ) external {}

  /// @dev Set acceptable margin of error between current vs expected NAV
  /// @param _marginOfError acceptable margin of error
  function setAcceptableMarginOfError(
    uint _marginOfError
  ) external override onlyRepositoryController {
    acceptableMarginOfError = _marginOfError;
  }

  function getAUM() external view override returns (uint) {
    return _getAUM();
  }

  /**
   * @dev Use to process deposits/withdrawals so valueOutsideRepository absolutely have to be up to date or it would revert
   * @return The price of a repository token.
   */
  function getNAV() external view override returns (uint) {
    return _getNAV();
  }

  /// @dev check if totalValueCap is reached
  /// @param plusAmount additional deposit amount in depositAsset decimals
  function isCapReached(uint plusAmount) external view override returns (bool) {
    return
      _getAUM() +
        ConvertDecimals.convertTo18(
          repository.totalQueuedDeposits() + plusAmount,
          _depositDecimals
        ) >=
      repository.totalValueCap18();
  }

  function checkExpectedNAV(uint expectedNAV) external view {
    _checkExpectedNAV(expectedNAV);
  }

  /// @dev returns AUM and block timestamp
  function getLastKnownAUM() external view override returns (uint, uint) {
    return (_getAUM(), block.timestamp);
  }

  /// @dev returns nav in 18 decimal and block timestamp
  function getLastKnownNAV() external view override returns (uint, uint) {
    return (_getNAV(), block.timestamp);
  }

  // Price of token = processed deposits (so despositAssets balance in repository minus pending deposits) in 1e18 / repository token supply.
  function _getNAV() private view returns (uint) {
    uint AUM = _getAUM();

    uint totalTokenSupply = _repositoryToken.totalSupply();

    if (totalTokenSupply > 0 && AUM == 0) {
      revert("AUM=0 while totalTokenSupply>0");
    } else if (totalTokenSupply == 0) {
      return DecimalMath.UNIT;
    }

    return AUM.divideDecimal(totalTokenSupply);
  }

  /// @dev check expectedNAV vs on chain nav
  ///      main cause of discrepency comes from too much accrued license fee. ie nav drops after collection fee
  ///      call collectLisenseFee beforehand to avoid this
  function _checkExpectedNAV(uint expectedNAV) internal view {
    uint marginOfError = 0;
    uint currentNAV = _getNAV();
    if (currentNAV > expectedNAV) {
      marginOfError = (currentNAV - expectedNAV).divideDecimal(currentNAV);
    } else {
      marginOfError = (expectedNAV - currentNAV).divideDecimal(currentNAV);
    }
    if (marginOfError > acceptableMarginOfError) {
      revert InconsistentNAV(currentNAV, expectedNAV);
    }
  }

  //AUM = despositAssets18 - totalQueuedDeposits18
  function _getAUM() private view returns (uint) {
    uint depositAssetBalance18 = ConvertDecimals.convertTo18(
      _depositAsset.balanceOf(address(repository)),
      _depositDecimals
    );
    uint AUM = depositAssetBalance18 -
      ConvertDecimals.convertTo18(
        repository.totalQueuedDeposits(),
        _depositDecimals
      );

    return AUM;
  }

  ///////////////
  // Modifiers //
  ///////////////

  modifier onlyRepositoryController() {
    if (!repository.isController(msg.sender)) {
      revert OnlyRepositoryController(address(repository), msg.sender);
    }
    _;
  }

  ////////////
  // EVENT ///
  ////////////

  event valueOutsideRepositoryUpdated(
    uint value,
    uint timestamp,
    address indexed owner
  );
  event NAVUpdated(uint value, uint timestamp, address indexed owner);
  event AUMUpdated(uint value, uint timestamp, address indexed owner);

  // ERRORS
}

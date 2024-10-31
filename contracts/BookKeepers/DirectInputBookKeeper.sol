// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IBookKeeper} from "../interfaces/IBookKeeper.sol";
import "../synthetix/Owned.sol";
import {Repository} from "../Repository.sol";
import {RepositoryToken} from "../RepositoryToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../libraries/SimpleInitializable.sol";
import {ConvertDecimals} from "../utils/ConvertDecimals.sol";
import "../synthetix/DecimalMath.sol";
import "../libraries/FixedPointMathLib.sol";
import {IDecimalMask} from "../interfaces/IDecimalMask.sol";

// This contract is written to allow for direct input of valueOutsideRepository
contract DirectInputBookKeeper is IBookKeeper, Owned, SimpleInitializable {
  using DecimalMath for uint;

  Repository public repository;
  RepositoryToken private _repositoryToken;
  IERC20 private _depositAsset;
  uint8 private _depositDecimals;
  bool public valueOutsideRepositorySettled; // flag funds settled or not
  uint public valueOutsideRepository18 = 0; //value outside repository in 18 decimals
  uint public valueStaleTimestamp = 0; //default to 0 so we don't flag valueOutsideRepository as stale initially

  /// @dev Last snapshot of valid AUM and nav, in case real time
  ///      info are not available for the front end
  uint public lastKnownNAV18 = 1 ether;
  uint public lastKnownAUM = 0;
  uint public lastKnownTimestamp = block.timestamp;

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

  /**
   * @dev mark valueOutsideRepositorySettled to true
   * @dev repository or repository controller can call this
   */
  function markValueOutsideRepositorySettled(
    bool _valueOutsideRepositorySettled
  ) external {
    if (
      !repository.isController(msg.sender) && address(repository) != msg.sender
    ) {
      revert OnlyRepositoryOrController();
    }
    valueOutsideRepositorySettled = _valueOutsideRepositorySettled;
  }

  /// @dev Mark valueOutsideRepository
  /// @param value the value to update to in 1e18
  /// @param validFor seconds till this value becomes stale
  function markValueOutsideRepository18(
    uint value,
    uint validFor,
    uint expectedNAV
  ) external onlyRepositoryController {
    valueOutsideRepository18 = value;

    valueStaleTimestamp = block.timestamp + validFor;

    lastKnownTimestamp = block.timestamp;
    lastKnownAUM = _getAUM();
    lastKnownNAV18 = _getNAV();

    valueOutsideRepositorySettled = true;

    _checkExpectedNAV(expectedNAV);

    emit valueOutsideRepositoryUpdated(value, block.timestamp, msg.sender);
    emit NAVUpdated(lastKnownNAV18, block.timestamp, msg.sender);
    emit AUMUpdated(lastKnownAUM, block.timestamp, msg.sender);
  }

  /// @dev Set acceptable margin of error between current vs expected NAV
  /// @param _marginOfError acceptable margin of error
  function setAcceptableMarginOfError(
    uint _marginOfError
  ) external override onlyRepositoryController {
    acceptableMarginOfError = _marginOfError;
  }

  /// @dev Returns the AUM of the pool, revert if valueOutsideRepository is not up to date
  function getAUM() external view override returns (uint) {
    _valueOutsideRepositoryValidityCheck();
    return _getAUM();
  }

  /**
   * @dev Use to process deposits/withdrawals so valueOutsideRepository absolutely have to be up to date or it would revert
   * @return The price of a repository token.
   */
  function getNAV() external view override returns (uint) {
    _valueOutsideRepositoryValidityCheck();
    return _getNAV();
  }

  /// @dev check if totalValueCap is reached
  /// @param plusAmount additional deposit amount in depositAsset decimals
  function isCapReached(uint plusAmount) external view override returns (bool) {
    return
      lastKnownAUM +
        ConvertDecimals.convertTo18(
          repository.totalQueuedDeposits() + plusAmount,
          _depositDecimals
        ) >=
      repository.totalValueCap18();
  }

  function checkExpectedNAV(uint expectedNAV) external view {
    _valueOutsideRepositoryValidityCheck();
    _checkExpectedNAV(expectedNAV);
  }

  /// @dev returns AUM and block timestamp
  function getLastKnownAUM() external view override returns (uint, uint) {
    return (lastKnownAUM, lastKnownTimestamp);
  }

  /// @dev returns nav in 18 decimal and block timestamp
  function getLastKnownNAV() external view override returns (uint, uint) {
    return (lastKnownNAV18, lastKnownTimestamp);
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

  //AUM = despositAssets18 - totalQueuedDeposits18 + value off chain
  function _getAUM() private view returns (uint) {
    uint depositAssetBalance18 = ConvertDecimals.convertTo18(
      _depositAsset.balanceOf(address(repository)),
      _depositDecimals
    );
    uint AUM = valueOutsideRepository18 +
      depositAssetBalance18 -
      ConvertDecimals.convertTo18(
        repository.totalQueuedDeposits(),
        _depositDecimals
      );

    return AUM;
  }

  /**
   * @dev Checks valueOutsideRepository is valid
   */
  function _valueOutsideRepositoryValidityCheck() internal view {
    if (valueStaleTimestamp > 0 && valueStaleTimestamp < block.timestamp) {
      revert MarkedValueStale(block.timestamp, valueStaleTimestamp);
    }

    if (!valueOutsideRepositorySettled) {
      revert ValueOutsideRepositoryNotSettled();
    }
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
  error MarkedValueStale(
    uint curBlockTimestamp,
    uint markedValueStaleTimestamp
  );
}

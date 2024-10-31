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

import "../synthetix/Owned.sol";
import {Repository} from "../Repository.sol";
import {RepositoryToken} from "../RepositoryToken.sol";
import "../libraries/SimpleInitializable.sol";
import {ConvertDecimals} from "../utils/ConvertDecimals.sol";
import "../synthetix/DecimalMath.sol";
import "../libraries/FixedPointMathLib.sol";

// interfaces
import {IBookKeeper} from "../interfaces/IBookKeeper.sol";
import {IBasePriceOracle} from "../interfaces/IBasePriceOracle.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IDecimalMask} from "../interfaces/IDecimalMask.sol";

// TLDR: This bookKeeper is able to take a variety of feeds
// to price the repository.
contract BookKeeper is IBookKeeper, Owned, SimpleInitializable {
  using DecimalMath for uint;

  struct PricingInformation {
    bytes32 feedname; // key for the feed namer
    address feed; // address of the aggregator contract
    address assetAddress; // asset address, the address where the asset exists, can be zero if offchain feed
    int priceInDecimals; // price in decimals
  }

  struct FeedData {
    bytes32 feedname; // key for the feed namer
    address feed; // address of the aggregator contract
    address assetAddress; // asset address, the address where the asset exists, can be zero if offchain feed
    uint decimals; // the native decimal count of the asset
  }

  mapping(bytes32 => address) public feeds; // maps the feeds based on the feedname (usdc/usd) = USDCUSD
  FeedData[] public feedDataArray;
  FeedData public depositAssetFeedData; // seperate feed, hoping to avoid logic necessary to avoid double count

  Repository public repository;
  RepositoryToken private _repositoryToken;
  IERC20 private _depositAsset;
  uint8 private _depositDecimals;

  address public executor;
  /// @dev flag funds settled or not (ignore this value for non hybrid repositories)
  bool public valueOutsideRepositorySettled;
  /// @dev acceptable error of margin between current vs expected NAV
  uint public acceptableMarginOfError = 0;

  modifier onlyRepositoryController() {
    if (!repository.isController(msg.sender)) {
      revert OnlyRepositoryController(address(repository), msg.sender);
    }
    _;
  }

  constructor() Owned() {}

  /// @dev Initalizes the book keeper with the depositAsset feed data and the repository
  /// @param _depositAssetFeedData The feed data corresponding to the depositAsset
  /// @param _repository the repository associated with this book keeper
  function init(
    FeedData memory _depositAssetFeedData,
    address _repository,
    address _executor
  ) external onlyOwner initializer {
    depositAssetFeedData = _depositAssetFeedData;
    repository = Repository(_repository);
    require(
      address(repository.bookKeeper()) == address(this),
      "Wrong repository"
    );
    _repositoryToken = repository.repositoryToken();
    _depositAsset = repository.depositAsset();
    _depositDecimals = IDecimalMask(address(_depositAsset)).decimals();
    executor = _executor;
  }

  /// @dev Adds a feed to the mapping
  /// @param feedname all caps feedname, (usdc/usd)= USDCUSD
  /// @param feed the address of the chainlink argegator
  /// @param assetAddress the address of the asset, if it is an onchain feed
  function addFeed(
    bytes32 feedname,
    address feed,
    address assetAddress,
    uint decimals
  ) external {
    if (feedname == bytes32(0)) {
      revert InvalidFeedName(feedname);
    }

    if (feeds[feedname] != address(0)) {
      revert FeedAlreadyExists(feedname);
    }

    if (feed == address(0)) {
      revert InvalidFeedAddress(feed);
    }

    feeds[feedname] = feed;

    // should add the feeds array as well
    feedDataArray.push(FeedData(feedname, feed, assetAddress, decimals));

    emit FeedAdded(feedname, feed);
  }

  /// @dev Removes a feed from the mapping
  /// @param feedname all caps feedname, (usdc/usd)= USDCUSD
  function removeFeed(bytes32 feedname) external {
    if (feedname == bytes32(0)) {
      revert InvalidFeedName(feedname);
    }

    if (feeds[feedname] == address(0)) {
      revert FeedAlreadyExists(feedname);
    }

    address feed = feeds[feedname];
    delete feeds[feedname];
    emit FeedRemoved(feedname, feed);
  }

  /// @dev set valueOutsideRepositorySettled
  /// @dev ignore this function
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

  /// @dev Set acceptable margin of error between current vs expected NAV
  /// @param _marginOfError acceptable margin of error
  function setAcceptableMarginOfError(
    uint _marginOfError
  ) external override onlyRepositoryController {
    acceptableMarginOfError = _marginOfError;
  }

  //////////////
  // Getters ///
  //////////////

  /// @dev Retrieves the feed data for a particular feed
  /// @param feedname all caps feedname, (usdc/usd)= USDCUSD
  function getFeedData(
    bytes32 feedname
  ) external view returns (PricingInformation memory) {
    if (feeds[feedname] == address(0)) {
      revert FeedAlreadyExists(feedname);
    }

    if (feedname == bytes32(0)) {
      revert InvalidFeedName(feedname);
    }

    address feed = feeds[feedname];
    (int priceInDecimals, ) = _readFeedData(feedname);

    return PricingInformation(feedname, feed, address(0), priceInDecimals);
  }

  /// @dev Retrieves the feed data for all feeds
  function getAllFeedData()
    external
    view
    returns (PricingInformation[] memory)
  {
    return _getAllFeedData();
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

  /// @dev Retrieves the feed data for all feeds
  /// @return an array of FeedData structs containing the feedname, feed address, and price in decimals
  function _getAllFeedData()
    internal
    view
    returns (PricingInformation[] memory)
  {
    PricingInformation[] memory allFeedData = new PricingInformation[](
      feedDataArray.length
    );

    for (uint i = 0; i < feedDataArray.length; i++) {
      bytes32 feedname = feedDataArray[i].feedname;
      address feed = feedDataArray[i].feed;
      (int priceInDecimals, ) = _readFeedData(feedname);
      address assetAddress = feedDataArray[i].assetAddress;

      allFeedData[i] = PricingInformation(
        feedname,
        feed,
        assetAddress,
        priceInDecimals
      );
    }

    return allFeedData;
  }

  /// @dev returns the AUM of the repository in 18 decimals
  function getAUM() external view override returns (uint) {
    return _getAUM();
  }

  function getNAV() external view override returns (uint) {
    return _getNAV();
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

  function _getNAV() internal view returns (uint) {
    uint AUM = _getAUM();

    uint totalTokenSupply = _repositoryToken.totalSupply();

    require(
      !(totalTokenSupply > 0 && AUM == 0),
      "AUM=0 while totalTokenSupply>0"
    );

    if (totalTokenSupply > 0 && AUM == 0) {
      revert("AUM=0 while totalTokenSupply>0");
    } else if (totalTokenSupply == 0) {
      return DecimalMath.UNIT;
    }

    return AUM.divideDecimal(totalTokenSupply);
  }

  /// @dev check expectedNAV vs current on chain nav
  ///      main reason for discrepency is too much accrued license fee
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

  /// @dev returns the AUM of the repository based on feed data and the repository's token balance
  /// seperate function and feed for depositAsset balance to prevent logic and inits needed for
  /// tracking the depositAsset data feed
  function _getDepositAssetFeedData() internal view returns (uint) {
    int priceInDecimals = IBasePriceOracle(depositAssetFeedData.feed)
      .getPriceFromFeed();

    // the depositAsset should never be worth a negative amount...
    if (priceInDecimals <= 0) {
      revert InvalidPriceForAsset(int(priceInDecimals));
    }

    return uint(priceInDecimals);
  }

  /// @dev Reads the feed data
  /// @param feedname all caps feedname, (usdc/usd)= USDCUSD
  /// @return the price in decimals of the feed
  function _readFeedData(bytes32 feedname) internal view returns (int, uint) {
    if (feedname == bytes32(0)) {
      revert InvalidFeedName(feedname);
    }

    if (feeds[feedname] == address(0)) {
      revert FeedDoesNotExist(feedname);
    }

    int priceInDecimals = IBasePriceOracle(feeds[feedname]).getPriceFromFeed();
    uint numberOfDecimalPlaces = IBasePriceOracle(feeds[feedname])
      .getDecimals();
    return (priceInDecimals, numberOfDecimalPlaces);
  }

  /// @dev returns cash value of repository
  function _getCashOfRepositoryAndExecutor() internal view returns (uint) {
    IERC20 depositAsset = IERC20(address(_depositAsset));
    uint256 depositAssetBalance = ConvertDecimals.convertTo18(
      depositAsset.balanceOf(address(repository)),
      IDecimalMask(address(_depositAsset)).decimals()
    );

    // USDC price basically cant be negative
    uint priceInDecimals = ConvertDecimals.convertTo18(
      _getDepositAssetFeedData(),
      IDecimalMask(address(_depositAsset)).decimals()
    );

    depositAssetBalance += ConvertDecimals.convertTo18(
      depositAsset.balanceOf(address(executor)),
      IDecimalMask(address(_depositAsset)).decimals()
    );

    uint cashValue = 0;
    if (depositAssetBalance > 0) {
      cashValue = priceInDecimals.multiplyDecimal(depositAssetBalance);
    }
    return cashValue;
  }

  /// @dev returns the AUM of the repository in 18 decimals
  function _getAUM() internal view returns (uint) {
    uint cashValue = _getCashOfRepositoryAndExecutor();
    for (uint i = 0; i < feedDataArray.length; i++) {
      (int assetPriceDecimals, uint feedDecimals) = _readFeedData(
        feedDataArray[i].feedname
      );
      uint tokenBalance = IERC20(feedDataArray[i].assetAddress).balanceOf(
        address(executor)
      );

      uint assetPrice18 = _abs(assetPriceDecimals);

      if (feedDataArray[i].decimals != 18) {
        tokenBalance = ConvertDecimals.convertTo18(
          tokenBalance,
          uint8(feedDataArray[i].decimals)
        );
      }

      if (feedDecimals != 18) {
        assetPrice18 = ConvertDecimals.convertTo18(
          assetPrice18,
          uint8(feedDecimals)
        );
      }

      if (assetPriceDecimals < 0) {
        cashValue -= assetPrice18.multiplyDecimal(tokenBalance);
      } else {
        cashValue += assetPrice18.multiplyDecimal(tokenBalance);
      }
    }
    return cashValue; // change this to include the other assets held by the repository
  }
  /////////////
  // HELPER ///
  ////////////

  /**
   * @dev Compute the absolute value of `val`.
   *
   * @param val The number to absolute value.
   */
  function _abs(int val) internal pure returns (uint) {
    return uint(val < 0 ? -val : val);
  }

  /////////////
  // ERRORS ///
  /////////////

  error InvalidFeedName(bytes32 proposedFeedname);
  error FeedAlreadyExists(bytes32 feedname);
  error InvalidFeedAddress(address proposedFeedAddress);
  error FeedDoesNotExist(bytes32 feedname);
  error InvalidPriceForAsset(int priceInDecimals);

  /////////////
  // EVENTS ///
  /////////////

  event FeedAdded(bytes32 indexed feedname, address indexed feed);
  event FeedRemoved(bytes32 indexed feedname, address indexed feed);
}

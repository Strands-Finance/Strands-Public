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
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/// @title BookKeeper
/// @notice Abstract base class providing core feed-based valuation functionality for repositories
/// @dev Implements token watchlist management, price validation, and executor balance calculation
abstract contract BookKeeper is IBookKeeper, Owned, SimpleInitializable {
  using DecimalMath for uint;

  Repository public repository;
  RepositoryToken internal _repositoryToken;
  IERC20 internal _depositAsset;
  uint8 internal _depositDecimals;

  /// @dev Last snapshot of valid AUM and nav in USD, in case real time
  ///      info are not available for the front end
  uint public lastKnownUsdNAV18 = 1 ether;
  uint public lastKnownUsdAUM = 0;
  uint public lastKnownTimestamp = block.timestamp;

  /// @dev acceptable margin of error between current vs expected NAV
  uint public acceptableMarginOfError = 0;

  /// @dev Maximum age for price data in seconds (default: 24 hours)
  uint public maxPriceAge = 86400;

  /// @dev Flag to control whether executor balances are included in AUM calculation
  bool public includeExecutor = false;

  address[] public tokenWatchlist;
  mapping(address => address) public tokenAddress2feedAddress; // maps the feed address based on token address

  constructor() Owned() {}

  /// @dev Initalizes the book keeper with the depositAsset feed data and the repository
  /// @param _repository the repository associated with this book keeper
  function init(
    address _repository
  ) external onlyOwner initializer validAddress(_repository) {
    repository = Repository(_repository);
    if (address(repository.bookKeeper()) != address(this)) {
      revert InvalidAddress(address(repository.bookKeeper()));
    }
    _repositoryToken = repository.repositoryToken();
    if (address(_repositoryToken) == address(0)) {
      revert InvalidAddress(address(_repositoryToken));
    }
    _depositAsset = repository.depositAsset();
    _depositDecimals = IDecimalMask(address(_depositAsset)).decimals();
  }

  /// @dev Adds feedAddres of a token to the watchlist
  // @param tokenAddress the address of the token to add
  // @param feedAddress the address of the price feed for the token
  function addTokenToWatchlist(
    address tokenAddress,
    address feedAddress
  )
    external
    onlyRepositoryController
    validAddress(tokenAddress)
    validAddress(feedAddress)
  {
    if (tokenAddress2feedAddress[tokenAddress] != address(0)) {
      revert TokenAlreadyInWatchlist(tokenAddress);
    }
    tokenAddress2feedAddress[tokenAddress] = feedAddress;
    tokenWatchlist.push(tokenAddress);
    emit FeedAdded(tokenAddress, feedAddress);
  }

  /// @dev Removes a token from the watchlist
  function removeTokenFromWatchlist(
    address tokenAddress
  ) external onlyRepositoryController {
    if (tokenAddress2feedAddress[tokenAddress] == address(0)) {
      revert TokenNotInWatchlist(tokenAddress);
    }
    address feedAddress = tokenAddress2feedAddress[tokenAddress];
    delete tokenAddress2feedAddress[tokenAddress];
    uint256 length = tokenWatchlist.length;
    for (uint i = 0; i < length; i++) {
      if (tokenWatchlist[i] == tokenAddress) {
        tokenWatchlist[i] = tokenWatchlist[tokenWatchlist.length - 1]; // move last to this slot
        tokenWatchlist.pop(); // remove last
        break;
      }
    }
    emit FeedRemoved(tokenAddress, feedAddress);
  }

  /// @dev Set acceptable margin of error between current vs expected NAV
  /// @param _marginOfError acceptable margin of error
  function setAcceptableMarginOfError(
    uint _marginOfError
  ) external virtual override onlyRepositoryController {
    acceptableMarginOfError = _marginOfError;
  }

  /// @dev Set maximum age for price data in seconds
  /// @param _maxPriceAge maximum age in seconds (e.g., 86400 for 24 hours)
  function setMaxPriceAge(uint _maxPriceAge) external onlyRepositoryController {
    maxPriceAge = _maxPriceAge;
  }

  /// @dev Set whether executor balances should be included in AUM calculation
  /// @param _includeExecutor true to include executor balances, false to exclude them
  function setIncludeExecutor(
    bool _includeExecutor
  ) external onlyRepositoryController {
    includeExecutor = _includeExecutor;
  }

  /// @dev check if totalValueCap is reached
  /// @param plusAmount additional deposit amount in depositAsset decimals
  function isCapReached(
    uint plusAmount
  ) external view virtual override returns (bool) {
    // Use current AUM instead of lastKnownAUM for accurate cap checking
    uint currentAUM = _getAUM();

    // Calculate the value of the additional deposit
    uint depositValue18;
    address feedAddress = tokenAddress2feedAddress[address(_depositAsset)];

    if (feedAddress == address(0)) {
      revert TokenNotInWatchlist(address(_depositAsset));
    } else {
      // Use feed-based valuation
      int depositValue = _calcValue18(
        address(_depositAsset),
        int(repository.totalQueuedDeposits() + plusAmount)
      );

      // Handle case where deposit value might be negative
      if (depositValue < 0) {
        return false; // Negative deposit value shouldn't trigger cap
      }
      depositValue18 = uint(depositValue);
    }

    return currentAUM + depositValue18 >= repository.totalValueCap18();
  }

  /// @dev check expectedNAV vs on chain nav
  /// @param expectedNAV expected NAV to check against
  function checkExpectedNAV(uint expectedNAV) external view virtual {
    _checkExpectedNAV(expectedNAV);
  }

  /// @dev Returns the AUM of the pool in terms of both usd and depositAsset
  function getAUM()
    external
    view
    virtual
    override
    returns (uint aumUsd, uint aumDepositAsset)
  {
    aumUsd = _getAUM();
    aumDepositAsset = _convertUsdToDepositAsset(aumUsd);
  }

  /// @dev Returns the NAV of the pool in both USD and deposit asset
  function getNAV()
    external
    view
    virtual
    override
    returns (uint navUsd, uint navDepositAsset)
  {
    navUsd = _getNAV();
    navDepositAsset = _convertUsdToDepositAsset(navUsd);
  }

  /// @dev Returns the on-chain value (depositAsset + executor) in both USD and deposit asset
  /// @dev Can be negative when liabilities exceed assets (e.g., queued deposits + claimables > balance)
  function getValueOnChain()
    external
    view
    virtual
    override
    returns (int valueOnChainUsd, int valueOnChainDepositAsset)
  {
    valueOnChainUsd = _getValueOnChain();

    // Convert to deposit asset, preserving sign
    if (valueOnChainUsd == 0) {
      valueOnChainDepositAsset = 0;
    } else if (valueOnChainUsd > 0) {
      valueOnChainDepositAsset = int(_convertUsdToDepositAsset(uint(valueOnChainUsd)));
    } else {
      // Negative value: convert absolute value, then negate
      valueOnChainDepositAsset = -int(_convertUsdToDepositAsset(uint(-valueOnChainUsd)));
    }
  }

  /// @dev returns AUM in both units and timestamp
  function getLastKnownAUM()
    external
    view
    virtual
    override
    returns (uint aumUsd, uint aumDepositAsset, uint timestamp)
  {
    aumUsd = lastKnownUsdAUM;
    aumDepositAsset = _convertUsdToDepositAsset(aumUsd);
    timestamp = lastKnownTimestamp;
  }

  /// @dev returns NAV in both units and timestamp
  function getLastKnownNAV()
    external
    view
    virtual
    override
    returns (uint navUsd, uint navDepositAsset, uint timestamp)
  {
    navUsd = lastKnownUsdNAV18;
    navDepositAsset = _convertUsdToDepositAsset(navUsd);
    timestamp = lastKnownTimestamp;
  }

  // Price of token = processed deposits (so despositAssets balance in repository minus pending deposits) in 1e18 / repository token supply.
  function _getNAV() internal view returns (uint) {
    uint AUM = _getAUM();

    uint totalTokenSupply = _repositoryToken.totalSupply();

    if (totalTokenSupply > 0 && AUM == 0) {
      revert NonPositiveAUM(int(AUM));
    } else if (totalTokenSupply == 0) {
      return DecimalMath.UNIT;
    }

    return AUM.divideDecimal(totalTokenSupply);
  }

  /// @dev check expectedNAV vs on chain nav
  ///      main cause of discrepency comes from too much accrued license fee. ie nav drops after collection fee
  ///      call collectLisenseFee beforehand to avoid this
  /// @param expectedNAV expected NAV to check against
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

  /// @dev Calculate on-chain value (depositAsset balance - queued deposits - queued claimables + executor value)
  /// @return On-chain value in USD with 18 decimals (signed to handle negative balances)
  function _getValueOnChain() internal view returns (int) {
    int depositAssetBalance = int(
      _depositAsset.balanceOf(address(repository))
    ) - int(repository.totalQueuedDeposits())
      - int(repository.totalQueuedClaimables());

    int depositAssetValue18 = _calcValue18(
      address(_depositAsset),
      depositAssetBalance
    );

    int executorValue = includeExecutor
      ? _calcSumValue18(repository.executor())
      : int(0);

    return depositAssetValue18 + executorValue;
  }

  /// @dev Calculate AUM - can be overridden by child classes that have off-chain value
  /// @dev Base implementation: AUM = on-chain value only
  /// @return AUM in USD with 18 decimals
  function _getAUM() internal view virtual returns (uint) {
    int totalAUM = _getValueOnChain();

    // Only convert to uint at the end, with proper validation
    if (totalAUM < 0) {
      revert NonPositiveAUM(totalAUM);
    }
    return uint(totalAUM);
  }

  /// @dev calculate sum total value of all tokens on watchlist in the target wallet/contract
  /// @param target the address to check balances of
  function _calcSumValue18(address target) internal view returns (int) {
    int sumValue18;
    uint256 length = tokenWatchlist.length;
    for (uint i = 0; i < length; i++) {
      address tokenAddress = tokenWatchlist[i];
      int balance = int(IERC20(tokenAddress).balanceOf(target));

      // If this is WETH, also include native ETH balance
      if (tokenAddress == repository.repositoryFactory().WETH()) {
        balance += int(target.balance);
      }

      sumValue18 += _calcValue18(tokenAddress, balance);
    }
    return sumValue18;
  }

  /// @dev calculate total value of a token by grabbing the feed for its value then multiply by balance
  /// @param tokenAddress the address of the token to check
  /// @param balance the balance of the token to check (can be negative)
  function _calcValue18(
    address tokenAddress,
    int balance
  ) internal view validAddress(tokenAddress) returns (int) {
    address feedAddress = tokenAddress2feedAddress[tokenAddress];
    if (feedAddress == address(0)) {
      revert TokenNotInWatchlist(tokenAddress);
    }

    AggregatorV3Interface priceFeed = AggregatorV3Interface(feedAddress);
    (, int price, , uint lastUpdate, ) = priceFeed.latestRoundData();

    // Validate price is positive
    if (price <= 0) {
      revert InvalidPriceForAsset(tokenAddress, price);
    }

    // Check price staleness
    if (lastUpdate > block.timestamp) {
      // Future timestamp is invalid (oracle malfunction or manipulation)
      revert StalePriceData(tokenAddress, lastUpdate, maxPriceAge);
    }
    if (block.timestamp - lastUpdate > maxPriceAge) {
      revert StalePriceData(tokenAddress, lastUpdate, maxPriceAge);
    }

    uint decimalOfPrice = priceFeed.decimals();
    uint8 decimalOfToken = IDecimalMask(tokenAddress).decimals();

    uint tokenBalance18 = ConvertDecimals.convertTo18(
      FixedPointMathLib.abs(balance),
      decimalOfToken
    );

    // Safe to convert price to uint since we validated it's positive
    uint assetPrice18 = ConvertDecimals.convertTo18(
      uint(price),
      uint8(decimalOfPrice)
    );
    uint absValue = tokenBalance18.multiplyDecimal(assetPrice18);

    // Only balance sign matters since price is always positive
    return balance < 0 ? -int(absValue) : int(absValue);
  }

  /// @dev Convert USD value to deposit asset value using deposit asset feed
  /// @param usdValue the USD value with 18 decimals to convert
  function _convertUsdToDepositAsset(
    uint usdValue
  ) internal view returns (uint) {
    if (usdValue == 0) return 0;

    address feedAddress = tokenAddress2feedAddress[address(_depositAsset)];

    if (feedAddress == address(0)) {
      revert TokenNotInWatchlist(address(_depositAsset));
    }

    AggregatorV3Interface priceFeed = AggregatorV3Interface(feedAddress);
    (, int price, , uint lastUpdate, ) = priceFeed.latestRoundData();

    // Validate price is positive
    if (price <= 0) {
      revert InvalidPriceForAsset(address(_depositAsset), price);
    }

    // Check price staleness
    if (lastUpdate > block.timestamp) {
      // Future timestamp is invalid (oracle malfunction or manipulation)
      revert StalePriceData(address(_depositAsset), lastUpdate, maxPriceAge);
    }
    if (block.timestamp - lastUpdate > maxPriceAge) {
      revert StalePriceData(address(_depositAsset), lastUpdate, maxPriceAge);
    }

    uint decimalOfPrice = priceFeed.decimals();

    // Convert: usdValue18 / priceUsd18 = depositAssetValue18
    uint priceUsd18 = ConvertDecimals.convertTo18(
      uint(price),
      uint8(decimalOfPrice)
    );
    uint depositAssetValue18 = usdValue.divideDecimal(priceUsd18);

    // Convert back to deposit asset decimals
    return ConvertDecimals.convertFrom18(depositAssetValue18, _depositDecimals);
  }

  ///////////////
  // Modifiers //
  ///////////////

  /// @dev Restricts function access to repository controllers
  modifier onlyRepositoryController() {
    if (!repository.isController(msg.sender)) {
      revert OnlyRepositoryController(address(repository), msg.sender);
    }
    _;
  }

  /// @dev make sure address is non zero
  /// @param addr the address to check
  modifier validAddress(address addr) {
    if (addr == address(0)) {
      revert InvalidAddress(addr);
    }
    _;
  }

  ////////////
  // EVENT ///
  ////////////

  event FeedAdded(address indexed tokenAddress, address indexed feedAddress);
  event FeedRemoved(address indexed tokenAddress, address indexed feedAddress);

  // ERRORS
  error TokenAlreadyInWatchlist(address tokenAddress);
  error InvalidAddress(address addr);
  error TokenNotInWatchlist(address tokenAddress);
  error InvalidPriceForAsset(address tokenAddress, int priceInDecimals);
  error StalePriceData(address tokenAddress, uint lastUpdate, uint maxAge);
}

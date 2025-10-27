//SPDX-License-Identifier: ISC

pragma solidity ^0.8.20;

// inherited
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./synthetix/DecimalMath.sol";
import {ConvertDecimals} from "./utils/ConvertDecimals.sol";
import "./strands/StrandsOwned.sol";

// Imports
import {IBookKeeper} from "./interfaces/IBookKeeper.sol";
import {IRepository} from "./interfaces/IRepository.sol";
import {IGateKeeper} from "./interfaces/IGateKeeper.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {IDecimalMask} from "./interfaces/IDecimalMask.sol";
import {IStrandsCallback} from "./interfaces/IStrandsCallback.sol";
import {ReentrancyGuard} from "./libraries/ReentrancyGuard.sol";
import {IStrandsCallBackControlsInterface} from "./interfaces/IStrandsCallBackControlsInterface.sol";

import {RepositoryToken} from "./RepositoryToken.sol";
import {RepositoryFactory} from "./RepositoryFactory.sol";
import {SimpleInitializable} from "./libraries/SimpleInitializable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Repository is
  IRepository,
  StrandsOwned,
  SimpleInitializable,
  ReentrancyGuard
{
  using SafeERC20 for IERC20;
  using DecimalMath for uint;

  /// @dev the RepositoryToken for the pool
  RepositoryToken public repositoryToken;
  /// @dev the depositAsset address for the chain
  IERC20 public depositAsset;
  /// @dev the address of the factory that deployed this
  RepositoryFactory public repositoryFactory;

  /// @dev executor address
  address public executor;
  /// @dev a contract that abstracts away the calculations of the value of the pools assets
  IBookKeeper public bookKeeper;
  address public gateKeeper;

  /// @dev A flag that deposit enabled or not
  bool public depositEnabled;
  /// @dev A flag that withdraw enabled or not
  bool public withdrawEnabled;

  /// @dev a mapping that references headId with withdrawal
  mapping(uint withdrawalId => QueuedItem) public withdrawQueue;
  /// @dev a mapping that references headId with deposit
  mapping(uint depositId => QueuedItem) public depositQueue;
  /// @dev a utility mapping that references user address with aggregate queue data
  mapping(address => QueueData) public userQueue;

  /// @dev max totalValueOfPool in 1e18, for blocking new deposits
  uint public totalValueCap18;
  /// @dev depositAsset amount of deposits queued
  uint public totalQueuedDeposits;
  /// @dev the amount repository token queued for withdraw
  uint public totalQueuedWithdrawals;
  /// @dev the index of the next deposit to be processed
  uint public depositHeadToProcess;
  /// @dev the index of the next withdrawal to be processed
  uint public withdrawHeadToProcess;
  /// @dev index of next withdrawal in queue
  uint public withdrawHead;
  /// @dev index of next deposit in queue
  uint public depositHead;

  /// @dev timestamp of when license fee was last collected
  uint public lastFeeCollectionTime;
  /// @dev fee rate
  uint public licensingFeeRate; //1%=1e16
  /// @dev if depositAsset is WETH
  bool private _daIsWETH;
  uint8 private _depositDecimals;

  // claimable logic
  // @dev claimable amount for each user
  mapping(address => uint) public claimable;
  // @dev total amount waiting to be claimed
  uint public totalQueuedClaimables = 0;

  // Callback State
  bool public isCallbackEnabled;
  uint public callbackGasLimit = 0;

  /// @dev Maximum number of items that can be processed in a single batch
  uint256 public constant MAX_BATCH_SIZE = 100;

  // Callback Events
  event CallBackResulted(
    address indexed whitelistedContract,
    address indexed recipient,
    uint256 amount,
    uint256 timestamp,
    IStrandsCallBackControlsInterface.CallbackType callbackType,
    bool succuess
  );

  ////////////////
  // Modifiers ///
  ////////////////
  modifier onlyFactory() {
    if (msg.sender != address(repositoryFactory)) {
      revert OnlyFactoryAllowed(
        address(this),
        msg.sender,
        address(repositoryFactory)
      );
    }
    _;
  }

  modifier onlyBookKeeper() {
    if (msg.sender != address(bookKeeper)) {
      revert OnlyBookKeeperAllowed(
        address(this),
        msg.sender,
        address(bookKeeper)
      );
    }
    _;
  }

  constructor(
    address _owner,
    address _controller
  ) StrandsOwned(_owner, _controller) {
    repositoryFactory = RepositoryFactory(msg.sender);
  }

  /**
   * @dev Initializes the Repository
   * @param _executor the executor address
   * @param _bookKeeper the bookKeeper address
   * @param _gateKeeper the gateKeeper address
   * @param _depositAsset the address of the depositAsset
   * @param _totalValueCap18 the total value cap of the pool
   * @param _licensingFeeRate the licensing fee rate
   */
  function init(
    address _executor,
    address _bookKeeper,
    address _gateKeeper,
    address _depositAsset,
    uint _totalValueCap18,
    uint _licensingFeeRate
  ) public onlyOwner initializer {
    if (_executor == address(0)) {
      revert InvalidAddress("executor");
    }
    if (_bookKeeper == address(0)) {
      revert InvalidAddress("bookKeeper");
    }
    if (_depositAsset == address(0)) {
      revert InvalidAddress("depositAsset");
    }
    // Note: _gateKeeper can be address(0) to disable gatekeeper functionality

    bookKeeper = IBookKeeper(_bookKeeper);
    gateKeeper = _gateKeeper;
    executor = _executor;

    _depositDecimals = IDecimalMask(_depositAsset).decimals();
    depositAsset = IERC20(_depositAsset);
    _daIsWETH = address(depositAsset) == repositoryFactory.WETH();
    totalValueCap18 = _totalValueCap18;

    if (_licensingFeeRate > 5e16) {
      revert InvalidFeeRate();
    }

    licensingFeeRate = _licensingFeeRate;
  }

  /**
   * @dev Sets the repository token address (must be called after init)
   * @param _repositoryToken the address of the repository token
   */
  function setRepositoryToken(address _repositoryToken) external onlyOwner {
    if (address(repositoryToken) != address(0)) {
      revert RepositoryTokenAlreadySet();
    }
    if (_repositoryToken == address(0)) {
      revert InvalidAddress("repositoryToken");
    }
    repositoryToken = RepositoryToken(_repositoryToken);
  }

  /////////////
  // Setters //
  /////////////

  /**
   * @dev Sets the gas limit for the callback
   * @param _gasLimit the gas limit to be set
   */
  function setGasLimit(uint _gasLimit) external onlyController {
    callbackGasLimit = _gasLimit;
  }

  /**
   * @dev Sets the depositEnabled
   * @param _depositEnabled the flag of new depositEnabled flag
   */
  function setDepositEnabled(bool _depositEnabled) external onlyController {
    if (address(repositoryToken) == address(0)) {
      revert RepositoryTokenNotSet();
    }
    depositEnabled = _depositEnabled;
    emit DepositEnabledChanged(_depositEnabled);
  }

  /**
   * @dev Sets the withdrawEnabled
   * @param _withdrawEnabled the flag of new depositEnabled flag
   */
  function setWithdrawEnabled(bool _withdrawEnabled) external onlyController {
    if (address(repositoryToken) == address(0)) {
      revert RepositoryTokenNotSet();
    }
    withdrawEnabled = _withdrawEnabled;
  }

  /**
   * @dev Sets the repository cap
   * @param _totalValueCap18 new totalValueCap in 1e18 to be set
   */
  function setTotalValueCap18(uint _totalValueCap18) external onlyController {
    totalValueCap18 = _totalValueCap18;
    emit TotalValueCapChanged(_totalValueCap18);
  }

  /**
   * @dev Sets the booker Keeper address
   * @param _bookKeeper the address of the new bookKeeper
   */
  function setBookKeeper(IBookKeeper _bookKeeper) external onlyOwner {
    if (address(_bookKeeper) == address(0)) {
      revert InvalidAddress("bookKeeper");
    }
    bookKeeper = _bookKeeper;
    emit BookKeeperChanged(address(_bookKeeper));
  }

  /**
   * @dev Sets the Gate Keeper address
   * @param _gateKeeper the address of the new bookKeeper
   */
  function setGateKeeper(address _gateKeeper) external onlyOwner {
    gateKeeper = _gateKeeper;
    emit GateKeeperChanged(address(_gateKeeper));
  }

  /**
   * @dev Sets the executor address
   * @param _executor the address of the new executor
   */
  function setExecutor(address _executor) external onlyOwner {
    if (_executor == address(0)) {
      revert InvalidAddress("executor");
    }
    executor = _executor;
    emit ExecutorChanged(_executor);
  }

  function setCallbackEnabled(bool _isCallbackEnabled) external onlyController {
    isCallbackEnabled = _isCallbackEnabled;
  }

  ///////////////////////
  // Factory Functions //
  ///////////////////////

  /**
   * @dev Collects the licensing fee from the pool
   * @dev only Factory can call this
   */
  function collectLicensingFee() external onlyFactory {
    _collectLicensingFee();
  }

  /////////////////////
  // User Functions ///
  /////////////////////

  /**
   * @dev Creates a deposit that is queued to be processed
   * @param amount depositAsset amount in native decimal to deposit into the pool
   */
  function initiateDeposit(
    uint256 amount,
    uint256 minTokenAmount
  ) public nonReentrant {
    _preDepositChecks(amount);
    // transfer depositAsset from msg.sender to this contract
    depositAsset.safeTransferFrom(msg.sender, address(this), amount);
    _addToDepositQueue(amount, msg.sender, minTokenAmount);
  }

  /**
   * @dev creates a weth initiateDeposit wrapper if user choose to deposit eth
   */
  function initiateDepositEth(
    uint minTokenAmount
  ) external payable nonReentrant {
    _preDepositChecks(msg.value);
    //Check to make sure this function can only be called when depositAsset is WETH
    if (!_daIsWETH) {
      revert CannnotDepositAssetType();
    }

    IWETH weth = IWETH(address(depositAsset));
    weth.deposit{value: msg.value}();
    _addToDepositQueue(msg.value, msg.sender, minTokenAmount);
  }

  /**
   * @dev Creates a withdrawal that is queued to be processed
   * @param amount number of repository tokens to redeem
   * @param minimumOut minimum amount of depositAsset to receive in depositAsset decimals
   */
  function initiateWithdraw(
    uint256 amount,
    uint minimumOut
  ) external nonReentrant {
    if (!withdrawEnabled) {
      revert WithdrawNotEnabled();
    }

    _initiateWithdraw(amount, minimumOut, msg.sender);
  }

  ///////////////////////////
  // Controller Functions ///
  ///////////////////////////

  /**
   * @dev create shares for off chain deposits
   * @param amount18 of off chain deposit in 1e18
   * @param nav nav of off chain deposit
   * @param recipient of shares exchanged for off chain deposit
   */
  function offChainDeposit18(
    uint amount18,
    uint nav,
    address recipient
  ) external onlyController {
    // collect fee
    _collectLicensingFee();

    //check input nav vs on-chain nav
    bookKeeper.checkExpectedNAV(nav);

    uint tokenAmount = amount18.divideDecimal(nav);

    // minting repository tokens
    repositoryToken.mint(recipient, tokenAmount);
    bookKeeper.markValueOffChainSettled(false);

    emit OffChainDepositProcessed(
      recipient,
      amount18,
      nav,
      tokenAmount,
      block.timestamp
    );
  }

  /**
   * @dev destroy repository tokens when there are off chain withdrawals
   * @param tokenAmount number of repository tokens to redeem
   * @param nav nav of off chain withdraw
   * @param custodialWallet address of wallet where repository tokens are held
   */
  function offChainWithdraw(
    uint256 tokenAmount,
    uint nav,
    address custodialWallet
  ) external onlyController {
    // collect fee
    _collectLicensingFee();

    //check input nav vs on-chain nav
    bookKeeper.checkExpectedNAV(nav);

    uint amount18 = tokenAmount.multiplyDecimal(nav);
    if (repositoryToken.balanceOf(custodialWallet) < tokenAmount) {
      revert InsufficientRepositoryTokenBalance();
    }

    repositoryToken.burn(custodialWallet, tokenAmount);
    bookKeeper.markValueOffChainSettled(false);

    emit OffChainWithdrawalProcessed(
      msg.sender,
      custodialWallet,
      tokenAmount,
      nav,
      ConvertDecimals.convertFrom18(amount18, _depositDecimals),
      block.timestamp
    );
  }

  /**
   * @dev Processes the next deposit in the queue
   * @param limit the number of deposits to process
   */
  function processDeposits(uint256 limit) external onlyController {
    if (limit > MAX_BATCH_SIZE) {
      revert BatchSizeExceedsMaximum(limit, MAX_BATCH_SIZE);
    }

    // collect accrued license fee before processing so NAV is accurate
    _collectLicensingFee();

    uint nav18 = getNAV();

    uint256 target = depositHeadToProcess + limit;
    uint i;
    uint dh = depositHead;
    for (i = depositHeadToProcess; i < target; i++) {
      if (i >= dh) break;

      QueuedItem storage deposit = depositQueue[i];
      uint depositAmount = deposit.amountIn;
      if (deposit.isCancelled || depositAmount == 0) {
        continue;
      }

      // converting depositAsset to 18 decimal places
      uint tokenAmount18 = ConvertDecimals
        .convertTo18(depositAmount, _depositDecimals)
        .divideDecimal(nav18);

      if (tokenAmount18 < deposit.minAmountOut) {
        _refundDeposit(i);
        continue;
      }

      address recipient = deposit.recipient;

      // minting repository tokens
      repositoryToken.mint(recipient, tokenAmount18);
      // updating user's queue amount
      userQueue[recipient].depositAmount -= depositAmount;
      // updating the deposit queue
      totalQueuedDeposits -= depositAmount;

      emit DepositProcessed(
        recipient,
        i,
        depositAmount,
        nav18,
        tokenAmount18,
        block.timestamp
      );

      _executeCallback(
        deposit.recipient,
        tokenAmount18,
        IStrandsCallBackControlsInterface.CallbackType.DEPOSIT
      );
    }
    depositHeadToProcess = i;
  }

  /**
   * @dev Processes the next withdrawal in the queue
   * @param limit the number of withdrawals to process
   */
  function processWithdrawals(uint256 limit) external onlyController {
    if (limit > MAX_BATCH_SIZE) {
      revert BatchSizeExceedsMaximum(limit, MAX_BATCH_SIZE);
    }

    // collect fee
    _collectLicensingFee();
    uint nav18 = getNAV();

    uint256 target = withdrawHeadToProcess + limit;
    uint i;
    uint wh = withdrawHead;
    for (i = withdrawHeadToProcess; i < target; i++) {
      if (i >= wh) break;

      QueuedItem storage withdrawal = withdrawQueue[i];
      uint tokenAmount = withdrawal.amountIn;
      if (withdrawal.isCancelled || tokenAmount == 0) {
        continue;
      }

      uint amount18 = withdrawal.amountIn.multiplyDecimal(nav18);
      uint amount = ConvertDecimals.convertFrom18(amount18, _depositDecimals);
      address recipient = withdrawal.recipient;
      if (
        depositAsset.balanceOf(address(this)) <
        totalQueuedDeposits + totalQueuedClaimables + amount
      ) {
        revert InsufficientLocalFundsToProcessRedemption(
          tokenAmount,
          amount,
          depositAsset.balanceOf(address(this)),
          totalQueuedDeposits,
          totalQueuedClaimables,
          i
        );
      }

      if (amount < withdrawal.minAmountOut) {
        // if the amount is less than the minimum amount, the withdrawal request is cancelled
        _removeWithdrawFromQueue(i);
        continue;
      }

      userQueue[withdrawal.recipient].withdrawalAmount -= tokenAmount;
      totalQueuedWithdrawals -= tokenAmount;

      repositoryToken.burn(address(this), tokenAmount);

      // moves the funds to the claimable pool
      _createClaimable(recipient, amount);

      emit WithdrawalProcessed(
        msg.sender,
        recipient,
        withdrawal.id,
        tokenAmount,
        nav18,
        amount,
        block.timestamp
      );

      _executeCallback(
        withdrawal.recipient,
        amount,
        IStrandsCallBackControlsInterface.CallbackType.WITHDRAW
      );
    }

    withdrawHeadToProcess = i;
  }

  /**
   * @dev removes deposit from the queue and returns the depositAsset to the user
   * @param index the index of the deposit to be removed from queue
   */
  function removeDepositFromQueue(uint index) external onlyController {
    if (index < depositHeadToProcess) {
      revert InvalidIndex();
    }

    _refundDeposit(index);
  }

  /**
   * @dev removes withdrawal from the queue and returns the repository tokens to the user
   * @param index the index of the withdrawal to be removed
   */
  function removeWithdrawalFromQueue(uint index) external onlyController {
    if (index < withdrawHeadToProcess) {
      revert InvalidIndex();
    }
    _removeWithdrawFromQueue(index);
  }

  /**
   * @dev refunds all the users that have repository tokens in the pool
   * @param refundAddresses the addresses to refund
   */
  function initiateWithdrawAllFor(
    address[] calldata refundAddresses
  ) external onlyController {
    if (!withdrawEnabled) {
      revert WithdrawNotEnabled();
    }

    if (refundAddresses.length > MAX_BATCH_SIZE) {
      revert BatchSizeExceedsMaximum(refundAddresses.length, MAX_BATCH_SIZE);
    }

    // checks that the address has repository tokens and if it does then add it to the withdrawal queue
    for (uint i = 0; i < refundAddresses.length; i++) {
      uint tokenAmount = repositoryToken.balanceOf(refundAddresses[i]);
      if (tokenAmount > 0) {
        _initiateWithdraw(tokenAmount, 0, refundAddresses[i]);
      } else {
        emit InvalidWithdrawQueued(refundAddresses[i], block.timestamp);
      }
    }
  }

  /**
   * @dev Sets the licensing fee of repository
   * @param _licensingFeeRate The new licensing fee rate (1%=1e16)
   */
  function setLicensingFeeRate(uint _licensingFeeRate) external onlyController {
    if (_licensingFeeRate > 5e16) {
      revert InvalidFeeRate();
    }
    licensingFeeRate = _licensingFeeRate;
    emit LicensingFeeRateSet(licensingFeeRate);
  }

  /**
   * @dev Transfer depositAsset from the Repository to executor
   * @dev controller and executor can both call this function
   * @param amount the amount of depositAsset in native decimals
   */
  function moveFundsToExecutor(uint amount) external override {
    if (!isController(msg.sender) && msg.sender != executor) {
      revert NotExecutorOrController();
    }

    if (amount == 0) {
      revert InvalidAmount();
    }

    if (
      depositAsset.balanceOf(address(this)) <
      amount + totalQueuedDeposits + totalQueuedClaimables
    ) {
      revert InsufficientLocalBalanceToTransfer(
        amount,
        depositAsset.balanceOf(address(this)),
        totalQueuedDeposits,
        totalQueuedClaimables,
        msg.sender
      );
    }

    depositAsset.safeTransfer(executor, amount);

    bookKeeper.markValueOffChainSettled(false);
    emit FundsRemovedFromPool(msg.sender, executor, amount, block.timestamp);
  }

  function updateRepositoryTokenName(
    string calldata _newName
  ) external onlyOwner {
    repositoryToken.updateTokenName(_newName);
  }

  /**
   * @dev Redeems User redeem their processed withdrawal
   * @param recipient addresses of the recipients
   */
  function redeemClaimableDelegated(
    address[] calldata recipient
  ) external onlyController {
    for (uint i = 0; i < recipient.length; i++) {
      _redeemClaimable(recipient[i]);
    }
  }

  ////////////////////
  // User Functions //
  ////////////////////

  /**
   * @dev Redeems User redeem their processed withdrawal
   */
  function redeemClaimable() external nonReentrant {
    _redeemClaimable(msg.sender);
  }

  //////////////
  // GETTERS ///
  //////////////

  /**
   * @dev Returns the Owners address
   * @return Owners address
   */
  function getOwnerAddress() external view override returns (address) {
    return owner;
  }

  /**
   * @dev Returns the price in USD term of a single token in 18 decimals based on the total pool value and total token supply.
   * @return price of single token in 18 decimals (standardized)
   */
  function getNAV() public view returns (uint) {
    (uint navUsd, ) = bookKeeper.getNAV();
    return navUsd;
  }

  /**
   * @dev Returns the AUM in protocol in USD term
   * @return AUM in 18 decimals (standardized)
   */
  function getAUM() external view returns (uint) {
    (uint aumUsd, ) = bookKeeper.getAUM();
    return aumUsd;
  }

  /**
   * @dev Returns last known AUM in pool and timestamp
   * @return AUM in 18 decimals and timestamp
   */
  function getLastKnownAUM() external view returns (uint, uint) {
    (uint aumUsd, , uint timestamp) = bookKeeper.getLastKnownAUM();
    return (aumUsd, timestamp);
  }

  /**
   * @dev Returns last known NAV in pool and timestamp
   * @return NAV in 18 decimals and timestamp
   */
  function getLastKnownNAV() external view returns (uint, uint) {
    (uint navUsd, , uint timestamp) = bookKeeper.getLastKnownNAV();
    return (navUsd, timestamp);
  }

  /**
   * @dev Returns license fee in 18 decimals accured since last collection
   * @return licenseFee18 amount in 1e18
   */
  function getLicenseFeeAccrued() public view returns (uint) {
    uint totalSupply = repositoryToken.totalSupply();
    return _getLicenseFeeAccrued(totalSupply);
  }

  /////////////////////////
  // INTERNAL FUNCTIONS ///
  /////////////////////////

  /**
   * @dev Internal function to redeem claimable amount
   * @param recipient address of the recipient
   */
  function _redeemClaimable(address recipient) internal {
    uint amount = claimable[recipient];
    claimable[recipient] = 0;
    totalQueuedClaimables -= amount;

    if (amount == 0) {
      revert InvalidAmount();
    }

    depositAsset.safeTransfer(recipient, amount);

    emit ClaimRedeemed(recipient, block.timestamp, amount);

    _executeCallback(
      recipient,
      amount,
      IStrandsCallBackControlsInterface.CallbackType.CLAIM
    );
  }

  /**
   * @dev Internal function to get the license fee accrued
   * @param totalSupply total supply of repository tokens
   * @return licenseFee18 amount in 1e18
   */
  function _getLicenseFeeAccrued(
    uint totalSupply
  ) internal view returns (uint) {
    (, uint navDepositAsset) = bookKeeper.getNAV();
    uint proRate = (licensingFeeRate *
      (block.timestamp - lastFeeCollectionTime)) / 365 days;
    uint licenseFee18 = totalSupply
      .multiplyDecimal(navDepositAsset)
      .multiplyDecimal(proRate);
    return licenseFee18;
  }

  /**
   * @dev refunds the withdrawal and returns the repository tokens to the user
   * @param index the index of the withdrawal to be refunded
   */
  function _removeWithdrawFromQueue(uint index) internal {
    // Should give back the same number of repository tokens as per the users initial request
    QueuedItem storage withdrawal = withdrawQueue[index];
    if (withdrawal.amountIn == 0) {
      revert InvalidAmount();
    }

    // refunds the repository tokens
    repositoryToken.transfer(withdrawal.recipient, withdrawal.amountIn);

    userQueue[withdrawal.recipient].withdrawalAmount -= withdrawal.amountIn;
    totalQueuedWithdrawals -= withdrawal.amountIn;

    withdrawal.amountIn = 0;
    withdrawal.isCancelled = true;
    withdrawal.minAmountOut = 0;
  }

  /**
   * @dev refunds the depositAsset to the user
   * @param index the index of the refund deposit
   */
  function _refundDeposit(uint index) internal {
    QueuedItem storage deposit = depositQueue[index];
    uint amount = deposit.amountIn;

    if (amount == 0) {
      revert InvalidAmount();
    }

    userQueue[deposit.recipient].depositAmount -= amount;
    totalQueuedDeposits -= amount;

    // marks the queue as the deposit is cancelled
    deposit.amountIn = 0;
    deposit.isCancelled = true;

    // move the funds to the claimable pol.
    _createClaimable(deposit.recipient, amount);
  }

  /**
   * @dev Creates a claimable for the user to get there depositAsset
   * @param recipient address of the recipient
   * @param amount amount of depositAsset
   */
  function _createClaimable(address recipient, uint amount) internal {
    claimable[recipient] += amount;
    totalQueuedClaimables += amount;

    emit ClaimableCreated(recipient, amount, block.timestamp);
  }

  /**
   * @dev Checks if amount can be deposited by the caller
   */
  function _preDepositChecks(uint amount) internal view {
    // Check deposit enabled or not
    if (!depositEnabled) {
      revert DepositNotEnabled();
    }

    if (amount == 0) {
      revert InvalidAmount();
    }

    // Check user can deposit to repository
    if (gateKeeper != address(0)) {
      IGateKeeper gt = IGateKeeper(gateKeeper);
      if (!gt.canDeposit(msg.sender)) {
        revert NotWhitelisted(msg.sender);
      }
    }

    // Check totalValueCap amount overflow
    if (bookKeeper.isCapReached(amount)) {
      revert TotalValueCapReached();
    }
  }

  /**
   * @dev Adds deposit to queue for recipient
   * @param amount amount of depositAsset
   */
  function _addToDepositQueue(
    uint256 amount,
    address recipient,
    uint256 minAmountLpTokens
  ) internal {
    depositQueue[depositHead] = QueuedItem({
      id: depositHead,
      recipient: recipient,
      amountIn: amount,
      initiatedTime: block.timestamp,
      isCancelled: false,
      minAmountOut: minAmountLpTokens
    });

    userQueue[msg.sender].depositAmount += amount;
    totalQueuedDeposits += amount;

    emit DepositQueued(recipient, amount, block.timestamp);
    depositHead++;
  }

  /**
   * @dev Creates a withdrawal that is queued to be processed
   * @param tokenAmount number of repository tokens to redeem
   * @param minimumOut minimum amount of depositAsset to receive in depositAsset decimals
   * @param recipient address of token holder and recipient of depositAsset after processing
   */
  function _initiateWithdraw(
    uint256 tokenAmount,
    uint256 minimumOut,
    address recipient
  ) internal {
    if (tokenAmount == 0) {
      revert InvalidAmount();
    }

    repositoryToken.withdrawHold(recipient, tokenAmount);

    withdrawQueue[withdrawHead] = QueuedItem({
      id: withdrawHead,
      recipient: recipient,
      amountIn: tokenAmount,
      initiatedTime: block.timestamp,
      isCancelled: false,
      minAmountOut: minimumOut
    });

    userQueue[recipient].withdrawalAmount += tokenAmount;
    totalQueuedWithdrawals += tokenAmount;

    emit WithdrawQueued(
      msg.sender,
      recipient,
      withdrawHead,
      tokenAmount,
      block.timestamp
    );
    withdrawHead++;
  }

  /**
   * @dev Collects the licensing fee from the pool
   */
  function _collectLicensingFee() internal {
    //set lastFeeCollectionTime after first deposit
    if (lastFeeCollectionTime == 0) {
      lastFeeCollectionTime = block.timestamp;
    }

    if (lastFeeCollectionTime == block.timestamp) return;
    uint totalSupply = repositoryToken.totalSupply();

    if (totalSupply > 0) {
      uint licenseFee = ConvertDecimals.convertFrom18(
        _getLicenseFeeAccrued(totalSupply),
        _depositDecimals
      );
      if (
        depositAsset.balanceOf(address(this)) <
        licenseFee + totalQueuedDeposits + totalQueuedClaimables
      ) {
        revert InsufficientLocalBalanceToTransfer(
          licenseFee,
          depositAsset.balanceOf(address(this)),
          totalQueuedDeposits,
          totalQueuedClaimables,
          msg.sender
        );
      }
      address feeRecipient = repositoryFactory.feeRecipient();
      depositAsset.safeTransfer(feeRecipient, licenseFee);

      emit LicensingFeeCollected(msg.sender, licenseFee, block.timestamp);
    }

    lastFeeCollectionTime = block.timestamp;
  }

  /*
   * @dev Executes the callback for the recipient
   * @param recipient the address of the recipient
   * @param amount the amount of depositAsset
   * @param callbackType the type of callback
   */
  function _executeCallback(
    address recipient,
    uint256 amount,
    IStrandsCallBackControlsInterface.CallbackType callbackType
  ) internal {
    if (!isCallbackEnabled) {
      return;
    }

    bool success = false;
    IStrandsCallBackControlsInterface.WhitelistedContract
      memory callbackAddress = IStrandsCallBackControlsInterface(
        address(gateKeeper)
      ).getCallbackContractForAddress(recipient);

    if (
      callbackType == IStrandsCallBackControlsInterface.CallbackType.DEPOSIT
    ) {
      try
        IStrandsCallback(callbackAddress.contractAddress).onDepositProcessed{
          gas: callbackGasLimit
        }(recipient, amount)
      {
        success = true;
      } catch {}
    } else if (
      callbackType == IStrandsCallBackControlsInterface.CallbackType.WITHDRAW
    ) {
      try
        IStrandsCallback(callbackAddress.contractAddress).onWithdrawalProcessed{
          gas: callbackGasLimit
        }(recipient, amount)
      {
        success = true;
      } catch {}
    } else if (
      callbackType == IStrandsCallBackControlsInterface.CallbackType.CLAIM
    ) {
      try
        IStrandsCallback(callbackAddress.contractAddress)
          .onClaimProcessOnBehalf{gas: callbackGasLimit}(recipient, amount)
      {
        success = true;
      } catch {}
    }

    emit CallBackResulted(
      callbackAddress.contractAddress,
      recipient,
      amount,
      block.timestamp,
      callbackType,
      success
    );
  }
}

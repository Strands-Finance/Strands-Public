// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

interface IRepository {
  /////////////
  // Struct ///
  /////////////

  struct QueuedItem {
    uint id;
    address recipient;
    // amount of DepositAsset/RepositoryToken in when deposit/withdraw.
    uint amountIn;
    // The time the deposit/withdrawal was initiated
    uint initiatedTime;
    // Minimum amount of RepositoryToken/DepositAsset out when deposit/withdraw.
    uint minAmountOut;
    bool isCancelled;
  }

  struct QueueData {
    uint depositAmount;
    uint withdrawalAmount;
  }

  /////////////
  // EVENTS ///
  /////////////
  /// @dev Emitted whenever a deposit is queued
  /// @param recipient the address that initiates the deposit
  /// @param amount the amount in depositAsset in native decimals being deposited
  /// @param timestamp the timestamp of the deposit is initiated
  event DepositQueued(address recipient, uint amount, uint timestamp);

  /// @dev Emitted whenever a deposit gets processed.
  /// @param recipient the address that recieved repository token
  /// @param amount the amount in depositAsset in native decimals that was deposited
  /// @param tokenMinted number of repository token minted
  /// @param nav18 the value of the repository token when deposit is processed
  /// @param timestamp the timestamp of the deposit
  event DepositProcessed(
    address indexed recipient,
    uint indexed depositQueueId,
    uint amount,
    uint nav18,
    uint tokenMinted,
    uint timestamp
  );

  /// @dev Emitted whenever an off chain deposit gets processed.
  /// @param recipient the address that recieved repository token
  /// @param amount the amount off chain deposit in equivalent depositAsset in native decimals
  /// @param tokenMinted number of repository token minted
  /// @param nav18 the value of the repository token when deposit is processed
  /// @param timestamp the timestamp of the deposit
  event OffChainDepositProcessed(
    address indexed recipient,
    uint amount,
    uint nav18,
    uint tokenMinted,
    uint timestamp
  );

  /// @dev Emitted whenever an off chain withdrawal is processed
  /// @param caller the address of the caller
  /// @param recipient the address of the address receiving the depositAsset
  /// @param tokenBurned the number of repository tokens burned
  /// @param nav18 the value of the repository token when withdrawal is processed
  /// @param amount amount of equivalent depositAsset in native decimals (informational, nothing transferred on-chain)
  /// @param timestamp the time the withdrawal is processed
  event OffChainWithdrawalProcessed(
    address indexed caller,
    address indexed recipient,
    uint tokenBurned,
    uint nav18,
    uint amount,
    uint timestamp
  );

  /// @dev Emitted whenever a withdrawal is processed
  /// @param caller the address of the caller
  /// @param recipient the address of the address receiving the depositAsset
  /// @param withdrawQueueId the uint that denotes the withdrawal
  /// @param tokenBurned the number of repository tokens burned
  /// @param nav18 the value of the repository token when withdrawal is processed
  /// @param amountReceived amount of depositAsset sent
  /// @param timestamp the time the withdrawal is processed
  event WithdrawalProcessed(
    address indexed caller,
    address indexed recipient,
    uint indexed withdrawQueueId,
    uint tokenBurned,
    uint nav18,
    uint amountReceived,
    uint timestamp
  );

  /// @dev Emitted whenever a withdrawal is queued
  /// @param caller the address of the caller
  /// @param recipient the address of holding the repository tokens
  /// @param withdrawQueueId the uint that denotes the withdraw
  /// @param tokenAmount the number of repository tokens to be exchanged
  /// @param timestamp the time the withdrawal is initiated
  event WithdrawQueued(
    address indexed caller,
    address indexed recipient,
    uint indexed withdrawQueueId,
    uint tokenAmount,
    uint timestamp
  );

  /// @dev Emitted whenever a licensing fee is collected
  /// @param caller the address of the caller
  /// @param amount the amount of depositAsset in native decimals collected
  /// @param timestamp the time the licensing fee was collected
  event LicensingFeeCollected(
    address indexed caller,
    uint amount,
    uint timestamp
  );

  /// @dev emmited when funds are removed from the pool
  /// @param recipient the address that the funds were sent to
  /// @param amount the amount in depositAsset in native decimal that was with drawn
  /// @param timestamp the timestamp of the withdrawal
  event FundsRemovedFromPool(
    address indexed caller,
    address recipient,
    uint amount,
    uint timestamp
  );

  /// @dev emmited when funds are moved from executor to pool
  /// @param executor the address that the funds were sent to
  /// @param amount the amount in depositAsset in native decimal that was with drawn
  /// @param timestamp the timestamp of the withdrawal
  event FundsAddedFromExecutor(
    address indexed caller,
    address executor,
    uint amount,
    uint timestamp
  );

  /// @dev emit event when new licensing fee rate is set
  /// @param newRate new licensing fee rate
  event LicensingFeeRateSet(uint newRate);

  /// @dev emit event when new executor is set
  /// @param executor new executor address
  event ExecutorChanged(address executor);

  /// @dev emit event when new DepositEnabled is updated
  /// @param _depositEnabled new DepositEnabled bool
  event DepositEnabledChanged(bool _depositEnabled);

  /// @dev emit event when new WithdrawEnabled is updated
  /// @param _withdrawEnabled new WithdrawEnabled bool
  event WithdrawEnabledChanged(bool _withdrawEnabled);

  /// @dev emit event when new TotalValueCap is updated
  /// @param _totalValueCap new TotalValueCap uint
  event TotalValueCapChanged(uint _totalValueCap);

  /// @dev emit event when new BookKeeper is updated
  /// @param _bookKeeper new BookKeeper address
  event BookKeeperChanged(address _bookKeeper);

  /// @dev emit event when new GateKeeper is updated
  /// @param _gateKeeper new GateKeeper address
  event GateKeeperChanged(address _gateKeeper);

  // @dev emitted event when InitiateWithdrawAllFor is called and a reciepent dodesn't have any
  // lp tokens
  // @param recipient the address that the funds were meant to be sent to
  // @param timestamp the timestamp of the withdrawal call
  event InvalidWithdrawQueued(address indexed recipient, uint timestamp);

  // @dev emitted event when a withdrawal is claimed
  // @param sender the address that the funds were sent to
  // @param amount the amount in depositAsset in native decimal that was with drawn
  // @param block.timestamp the timestamp of the withdrawal
  event WithdrawalClaimed(
    address indexed sender,
    uint indexed timestamp,
    uint amount
  );

  // @dev emitted event when a claimable is created
  // @param recipient the address that the funds were sent to
  // @param timestamp the timestamp of the withdrawal
  // @param amount the amount in depositAsset in native decimal that was with drawn
  event ClaimableCreated(
    address indexed recipient,
    uint indexed timestamp,
    uint amount
  );

  // @dev emitted event when a claimable is removed
  // @param recipient the address that the funds were sent to
  // @param timestamp the timestamp of the withdrawal
  // @param amount the amount in depositAsset in native decimal that was with drawn
  event ClaimRedeemed(
    address indexed recipient,
    uint indexed timestamp,
    uint amount
  );

  /////////////
  // ERRORS ///
  /////////////
  error NotExecutorOrController();
  error TotalValueCapReached();
  error InvalidAmount();
  error OnlyFactoryAllowed(address thrower, address caller, address factory);
  error OnlyBookKeeperAllowed(
    address thrower,
    address caller,
    address bookKeeper
  );
  error InsufficientLocalFundsToProcessRedemption(
    uint256 tokenAmount,
    uint256 amountDepositAsset,
    uint256 balance,
    uint256 totalQueuedDeposits,
    uint256 totalQueuedClaimables,
    uint id
  );
  error InsufficientLocalBalanceToTransfer(
    uint requestedAmount,
    uint balance,
    uint totalQueuedDeposits,
    uint totalQueuedClaimables,
    address controller
  );
  error DepositNotEnabled();
  error WithdrawNotEnabled();
  error NotWhitelisted(address caller);
  error CannnotDepositAssetType();
  error InsufficientRepositoryTokenBalance();
  error InvalidIndex();
  error InvalidFeeRate();
  error RepositoryTokenAlreadySet();
  error RepositoryTokenNotSet();
  error InvalidAddress(string parameterName);
  error BatchSizeExceedsMaximum(uint256 requested, uint256 maximum);

  function getOwnerAddress() external view returns (address);
  function moveFundsToExecutor(uint amount) external;
}

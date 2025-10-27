// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStrandsAccount {
  // Authorization errors
  error UnauthorizedOwner();
  error NotApprovedTrader();

  // Existence errors
  error AlreadyExists();
  error DoesNotExist();

  // Validation errors
  error FutureTimestamp();
  error ZeroValue();
  error StaleStatement();

  // State errors
  error AccountHasPositions();
  error InvalidTokenId();

  // Input errors
  error ZeroAddress();

  struct AccountDetails {
    string clearingFirm;
    string accountNumber;
    int accountValue;
    int initialMargin;
    int maintenanceMargin;
    int excessEquity;
    uint statementTimestamp; // Must set to timestamp>0 so we can use timestamp==0 to identify if AccountDetails is null
    address[] approvedTraders;
  }
  function getAccountDetails(
    uint accountTokenId_
  ) external view returns (AccountDetails memory);

  function getAccountValue(uint accountTokenId_) external view returns (int);

  function getStatementTimestamp(
    uint accountTokenId_
  ) external view returns (uint);
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStrandsAccount {
  struct AccountDetails {
    string clearingFirm;
    string accountNumber;
    uint accountValue;
    uint initialMargin;
    uint maintenanceMargin;
    uint excessEquity;
    uint statementTimestamp; // Must set to timestamp>0 so we can use timestamp==0 to identify if AccountDetails is null
    address[] approvedTraders;
  }
  function getAccountDetails(
    uint accountTokenId_
  ) external view returns (AccountDetails memory);

  function getAccountValue(uint accountTokenId_) external view returns (uint);

  function getStatementTimestamp(
    uint accountTokenId_
  ) external view returns (uint);
}

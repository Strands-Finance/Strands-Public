// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// this is an interface that will be used call back to the contract during processing given
// a contract implemeent this interface
interface IStrandsCallback {
    function onDepositProcessed(address recieptient, uint amount) external;
    function onWithdrawalProcessed(address recieptient, uint amount) external;
    function onClaimProcessOnBehalf(address recieptient, uint amount) external;
}
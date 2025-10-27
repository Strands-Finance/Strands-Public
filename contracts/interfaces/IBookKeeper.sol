// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

interface IBookKeeper {
  function getAUM() external view returns (uint aumUsd, uint aumDepositAsset);
  function getNAV() external view returns (uint navUsd, uint navDepositAsset);
  function getValueOnChain()
    external
    view
    returns (int valueOnChainUsd, int valueOnChainDepositAsset);
  function getLastKnownAUM()
    external
    view
    returns (uint aumUsd, uint aumDepositAsset, uint timestamp);
  function getLastKnownNAV()
    external
    view
    returns (uint navUsd, uint navDepositAsset, uint timestamp);
  function isCapReached(uint plusAmount) external view returns (bool);
  function markValueOffChainSettled(bool _valueOffChainSettled) external;
  function setAcceptableMarginOfError(uint _marginOfError) external;
  function checkExpectedNAV(uint expectedNAV) external view;
  function init(address _repository) external;

  /////////////
  // ERRORS ///
  /////////////
  error OnlyRepositoryOrController();
  error OnlyRepositoryController(address repository, address caller);
  error ValueOffChainNotSettled();
  error InconsistentNAV(uint currentNAV, uint expectedNAV);
  error MarkedValueStale(
    uint curBlockTimestamp,
    uint markedValueStaleTimestamp
  );
  error NonPositiveAUM(int totalAUM);
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ERC721} from "solmate/src/tokens/ERC721.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {StrandsOwned} from "../strands/StrandsOwned.sol";
import {IStrandsPosition} from "../interfaces/IStrandsPosition.sol";
import {IStrandsAccount} from "../interfaces/IStrandsAccount.sol";

contract StrandsAccount is IStrandsAccount, ERC721, StrandsOwned {
  uint256 public mintCounter;
  address public positionNFT;
  string tURI;

  mapping(uint => AccountDetails) private accountDetails;
  mapping(string => mapping(string => uint)) private accountTree; /// ClearingFirm -> AccountNumber -> TokenID
  mapping(address => uint[]) private _ownedAccountIds; // Owner -> Owned Token Ids
  mapping(uint => mapping(address => bool)) private _isApprovedTrader;

  constructor(
    string memory _name,
    string memory _symbol,
    string memory _tURI
  ) ERC721(_name, _symbol) StrandsOwned(msg.sender, msg.sender) {
    tURI = _tURI;
  }

  /**
   * @dev Get token uri of token id
   * @param tokenId id of nft
   */
  function tokenURI(
    uint tokenId
  ) public view override(ERC721) returns (string memory) {
    return tURI;
  }

  /**
   * @dev Set token uri of token id
   */
  function setTokenURI(string memory _tURI) public onlyController {
    tURI = _tURI;
  }

  /**
   * @dev Set approved traders
   * @param tokenId_ id of nft
   * @param traders_ list of addresses to be approved
   */
  function setApprovedTraders(
    uint tokenId_,
    address[] memory traders_
  ) external {
    // Check msg.sender is the owner of token id
    address nftOwner = _ownerOf[tokenId_];
    if (msg.sender != nftOwner) revert UnauthorizedOwner();
    for (uint i = 0; i < traders_.length; ++i) {
      if (!_isApprovedTrader[tokenId_][traders_[i]]) {
        accountDetails[tokenId_].approvedTraders.push(traders_[i]);
        _isApprovedTrader[tokenId_][traders_[i]] = true;
      }
    }
  }

  /**
   * @dev Remove approved traders
   * @param tokenId_ id of nft
   * @param trader_ address to be unapproved
   */
  function removeApprovedTrader(uint tokenId_, address trader_) external {
    // Check msg.sender is the owner of token id
    address nftOwner = _ownerOf[tokenId_];
    if (msg.sender != nftOwner) revert UnauthorizedOwner();
    // Check trader is approved trader
    if (!_isApprovedTrader[tokenId_][trader_]) revert NotApprovedTrader();

    uint length = accountDetails[tokenId_].approvedTraders.length;
    for (uint i = 0; i < length; ++i) {
      if (trader_ == accountDetails[tokenId_].approvedTraders[i]) {
        accountDetails[tokenId_].approvedTraders[i] = accountDetails[tokenId_]
          .approvedTraders[length - 1];
        accountDetails[tokenId_].approvedTraders.pop();
        _isApprovedTrader[tokenId_][trader_] = false;
        break;
      }
    }
  }

  /**
   * @dev Mint NFT
   * @param to address which will receive nft
   * @param clearingFirm_ position clearing firm
   * @param accountNumber_ position account number
   * @param accountValue_ account value
   * @param initialMargin_ intial margin
   * @param maintenanceMargin_ maintenance margin
   * @param excessEquity_ excess equity
   * @param timestamp statement timestamp
   */
  function mint(
    address to,
    string memory clearingFirm_,
    string memory accountNumber_,
    int accountValue_,
    int initialMargin_,
    int maintenanceMargin_,
    int excessEquity_,
    uint timestamp
  ) public onlyController {
    // Check NFT exists with same clearingFirm_ and accountNumber_
    address nftOwner = getOwner(clearingFirm_, accountNumber_);
    if (nftOwner != address(0)) revert AlreadyExists();
    mintCounter += 1;
    if (timestamp > block.timestamp) revert FutureTimestamp();
    // If we force it to be > 0, we can see if tokenId exists by checking accountDetails[invalidTokenId].timestamp == 0
    if (timestamp == 0) revert ZeroValue();
    accountDetails[mintCounter].clearingFirm = clearingFirm_;
    accountDetails[mintCounter].accountNumber = accountNumber_;
    accountDetails[mintCounter].accountValue = accountValue_;
    accountDetails[mintCounter].initialMargin = initialMargin_;
    accountDetails[mintCounter].maintenanceMargin = maintenanceMargin_;
    accountDetails[mintCounter].excessEquity = excessEquity_;
    accountDetails[mintCounter].statementTimestamp = timestamp;
    accountTree[clearingFirm_][accountNumber_] = mintCounter;

    _ownedAccountIds[to].push(mintCounter);
    _safeMint(to, mintCounter);
  }

  /**
   * @dev Update account details
   * @param clearingFirm_ position clearing firm
   * @param accountNumber_ position account number
   * @param accountValue_ account value
   * @param initialMargin_ intial margin
   * @param maintenanceMargin_ maintenance margin
   * @param excessEquity_ excess equity
   * @param timestamp statement timestamp
   */
  function updateValues(
    string memory clearingFirm_,
    string memory accountNumber_,
    int accountValue_,
    int initialMargin_,
    int maintenanceMargin_,
    int excessEquity_,
    uint timestamp
  ) external onlyController {
    uint accountTokenId = accountTree[clearingFirm_][accountNumber_];
    // Check the accountTokenId exist for clearingFirm_ and accountNumber_
    if (accountTokenId == 0) revert DoesNotExist();
    if (accountDetails[accountTokenId].statementTimestamp >= timestamp) revert StaleStatement();
    if (timestamp > block.timestamp) revert FutureTimestamp();
    accountDetails[accountTokenId].accountValue = accountValue_;
    accountDetails[accountTokenId].initialMargin = initialMargin_;
    accountDetails[accountTokenId].maintenanceMargin = maintenanceMargin_;
    accountDetails[accountTokenId].excessEquity = excessEquity_;
    accountDetails[accountTokenId].statementTimestamp = timestamp;
  }

  /**
   * @dev Transfer account and owned positions
   * @param clearingFirm_ position clearing firm
   * @param accountNumber_ position account number
   * @param to_ address which will receive nft
   */
  function transferAccount(
    string memory clearingFirm_,
    string memory accountNumber_,
    address to_
  ) external onlyController {
    uint accountTokenId_ = accountTree[clearingFirm_][accountNumber_];
    address nftOwner = _ownerOf[accountTokenId_];

    /// Transfer StrandsAccount to new owner
    safeTransferFrom(nftOwner, to_, accountTokenId_);

    /// Transfer StrandsPositions with clearingFirm+accountNumber to new owner
    uint256[] memory pids = IStrandsPosition(positionNFT)
      .getPositionIdsByAccount(clearingFirm_, accountNumber_, true);

    IStrandsPosition(positionNFT).batchTransferFrom(nftOwner, to_, pids);
  }

  /**
   * @dev Delete account
   * @param clearingFirm_ position clearing firm
   * @param accountNumber_ position account number
   */
  function deleteAccount(
    string memory clearingFirm_,
    string memory accountNumber_
  ) external onlyController {
    uint accountTokenId_ = accountTree[clearingFirm_][accountNumber_];
    uint256[] memory pids = IStrandsPosition(positionNFT)
      .getPositionIdsByAccount(clearingFirm_, accountNumber_, true);
    if (pids.length != 0) revert AccountHasPositions();

    _updateOwnedTokenIds(
      _ownerOf[accountTokenId_],
      address(0),
      accountTokenId_
    );

    // Delete the account if there's no position
    accountTree[clearingFirm_][accountNumber_] = 0;

    delete accountDetails[accountTokenId_];
    _burn(accountTokenId_);
  }

  /**
   * @dev transfer nft
   * @param from from address
   * @param to to address
   * @param id token id of nft to be transferred
   */
  function transferFrom(
    address from,
    address to,
    uint256 id
  ) public override onlyController {
    if (from != _ownerOf[id] || from == address(0)) revert UnauthorizedOwner();
    if (to == address(0)) revert ZeroAddress();

    unchecked {
      _balanceOf[from]--;
      _balanceOf[to]++;
    }

    _ownerOf[id] = to;

    _updateOwnedTokenIds(from, to, id);
    // delete getApproved[id]; Put back if we ever take off onlyController modifier

    emit Transfer(from, to, id);
  }

  //Remove if we ever take onlyController modifier off transferFrom
  function approve(address to, uint256 tokenId) public override {
    revert("transferFrom can only be called by controller");
  }

  /**
   * @dev Set position NFT address
   * @param positionNFT_ position nft address
   */
  function setPositionNFT(address positionNFT_) external onlyController {
    if (positionNFT_ == address(0)) revert ZeroAddress();
    positionNFT = positionNFT_;
  }

  /**
   * @dev Get positions by account id
   * @param tokenId_ account nft token id
   * @param includeExpiredPosition_ flag to include expired positions
   */
  function getPositionsByAccountId(
    uint tokenId_,
    bool includeExpiredPosition_
  )
    public
    view
    returns (IStrandsPosition.PositionDetails[] memory positionDetails)
  {
    if (_ownerOf[tokenId_] == address(0)) revert InvalidTokenId();

    // Get position IDs first (gas-efficient)
    uint[] memory pids = IStrandsPosition(positionNFT).getPositionIdsByAccount(
      accountDetails[tokenId_].clearingFirm,
      accountDetails[tokenId_].accountNumber,
      includeExpiredPosition_
    );

    // Fetch details for each position
    IStrandsPosition.PositionDetails[] memory result = new IStrandsPosition.PositionDetails[](pids.length);
    for (uint i = 0; i < pids.length; i++) {
      result[i] = IStrandsPosition(positionNFT).getPositionDetails(pids[i]);
    }

    return result;
  }

  /**
   * @dev Get owned accounts
   * @param target owner address
   */
  function getOwnerAccounts(
    address target
  ) public view returns (AccountDetails[] memory) {
    uint length = _ownedAccountIds[target].length;
    AccountDetails[] memory result = new AccountDetails[](length);
    for (uint i = 0; i < length; ++i) {
      result[i] = accountDetails[_ownedAccountIds[target][i]];
    }
    return result;
  }

  /**
   * @dev Get token id
   * @param clearingFirm_ position clearing firm
   * @param accountNumber_ position account number
   */
  function getTokenId(
    string memory clearingFirm_,
    string memory accountNumber_
  ) public view returns (uint) {
    return accountTree[clearingFirm_][accountNumber_];
  }

  /**
   * @dev Get owner address
   * @param clearingFirm_ position clearing firm
   * @param accountNumber_ position account number
   */
  function getOwner(
    string memory clearingFirm_,
    string memory accountNumber_
  ) public view returns (address) {
    uint accountTokenId = getTokenId(clearingFirm_, accountNumber_);
    // Check the accountTokenId exist for clearingFirm_ and accountNumber_
    if (accountTokenId > 0) {
      return _ownerOf[accountTokenId];
    }
    return address(0);
  }

  /**
   * @dev Get account details
   * @param accountTokenId_ account token id
   */
  function getAccountDetails(
    uint accountTokenId_
  ) public view returns (AccountDetails memory) {
    require(_ownerOf[accountTokenId_] != address(0), "Invalid account tokenId");
    return accountDetails[accountTokenId_];
  }

  /**
   * @dev Get account value
   * @param accountTokenId_ account token id
   */
  function getAccountValue(uint accountTokenId_) external view returns (int) {
    return accountDetails[accountTokenId_].accountValue;
  }

  /**
   * @dev Get account statementTimestamp
   * @param accountTokenId_ account token id
   */
  function getStatementTimestamp(
    uint accountTokenId_
  ) external view returns (uint) {
    return accountDetails[accountTokenId_].statementTimestamp;
  }

  /**
   * @dev Update owned token id
   * @param from from address
   * @param to to address
   * @param id token id
   */
  function _updateOwnedTokenIds(address from, address to, uint256 id) internal {
    uint length = _ownedAccountIds[from].length;
    for (uint i = 0; i < length; ) {
      if (id == _ownedAccountIds[from][i]) {
        _ownedAccountIds[from][i] = _ownedAccountIds[from][length - 1];
        _ownedAccountIds[from].pop();
        break;
      }
      unchecked {
        ++i;
      }
    }
    if (to != address(0)) {
      _ownedAccountIds[to].push(id);
    }
  }

  /**
   * @dev string compare
   * @param str1 first string
   * @param str2 second string
   */
  function stringCompare(
    string memory str1,
    string memory str2
  ) internal pure returns (bool) {
    if (bytes(str1).length != bytes(str2).length) {
      return false;
    }
    return keccak256(bytes(str1)) == keccak256(bytes(str2));
  }
}

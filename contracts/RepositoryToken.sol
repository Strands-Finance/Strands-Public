//SPDX-License-Identifier: ISC
// Forked from Lyra - RepositoryToken.sol
pragma solidity 0.8.20;

// Inherited
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IGateKeeper} from "./interfaces/IGateKeeper.sol";
import {IRepository} from "./interfaces/IRepository.sol";

/**
 * @title RepositoryToken
 * @author Strands
 * @dev An ERC20 token which represents a share of the Repository.
 * It is minted when users deposit, and burned when users withdraw.
 */
contract RepositoryToken is ERC20 {
  /// @dev The repository for which these tokens represent a share of
  address public immutable repository;

  /// @dev repository token custom name
  string private _tokenName;

  address public gateKeeper;
  bool public ownerTransferable = true;

  ///////////
  // Setup //
  ///////////

  /**
   * @param name_ Token collection name
   * @param symbol_ Token collection symbol
   * @param gateKeeper_ Gate keeper address for transfer restrictions
   * @param repository_ Repository address that owns this token
   */
  constructor(
    string memory name_,
    string memory symbol_,
    address gateKeeper_,
    address repository_
  ) ERC20(name_, symbol_) {
    // sets the repository address
    repository = repository_;
    _tokenName = name_;
    gateKeeper = gateKeeper_;
  }

  function transferFrom(
    address from,
    address to,
    uint256 value
  ) public override returns (bool) {
    if (
      ownerTransferable &&
      msg.sender == IRepository(repository).getOwnerAddress()
    ) {
      _transfer(from, to, value);
      return true;
    }

    if (gateKeeper == address(0)) {
      return super.transferFrom(from, to, value);
    } else {
      IGateKeeper gk = IGateKeeper(gateKeeper);
      require(
        gk.canTransferRepositoryToken(from) &&
          gk.canTransferRepositoryToken(to),
        "Blacklisted"
      );
      return super.transferFrom(from, to, value);
    }
  }

  function transfer(address to, uint256 value) public override returns (bool) {
    if (gateKeeper == address(0)) {
      return super.transfer(to, value);
    } else {
      IGateKeeper gk = IGateKeeper(gateKeeper);
      require(
        (!gk.canTransferRepositoryToken(to) && msg.sender == repository) ||
          (gk.canTransferRepositoryToken(msg.sender) &&
            gk.canTransferRepositoryToken(to)),
        "Blacklisted"
      );
      return super.transfer(to, value);
    }
  }

  /////////////////////
  // Only Repository //
  /////////////////////
  /// @dev Mints new tokens to the given account
  function mint(address account, uint tokenAmount) external onlyRepository {
    _mint(account, tokenAmount);
  }

  /// @dev Burn tokens from the given account
  function burn(address account, uint tokenAmount) external onlyRepository {
    _burn(account, tokenAmount);
  }

  /// @dev Holds the given amount of tokens from the given account
  function withdrawHold(
    address from,
    uint tokenAmount
  ) external onlyRepository {
    _transfer(from, repository, tokenAmount);
  }

  /// @dev Give up ownerTransability for decentralized version of repository
  function renounceOwnerTransferability() external onlyRepositoryOwner {
    ownerTransferable = false;
  }

  function updateTokenName(string calldata _newName) external onlyRepository {
    _tokenName = _newName;
  }

  function name() public view override returns (string memory) {
    return _tokenName;
  }

  ///////////////
  // Modifiers //
  ///////////////
  modifier onlyRepository() {
    if (msg.sender != repository) {
      revert OnlyRepository(address(this), msg.sender, repository);
    }
    _;
  }

  modifier onlyRepositoryOwner() {
    if (msg.sender != IRepository(repository).getOwnerAddress()) {
      revert OnlyRepositoryOwner(address(this), msg.sender, repository);
    }
    _;
  }

  ////////////
  // Errors //
  ////////////
  error OnlyRepository(address thrower, address caller, address repository);

  error OnlyRepositoryOwner(
    address thrower,
    address caller,
    address repository
  );
}

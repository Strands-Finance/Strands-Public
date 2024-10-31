# v2-vaults
Strands V2 repository contracts.


## Table of Contents

- [v2-vaults](#v2-vaults)
  - [Table of Contents](#table-of-contents)
  - [Repository structure](#repository-structure)
    - [BookKeeper](#bookkeeper)
    - [Repository](#repository)
    - [Controller](#controller)
    - [Oracle (BookKeeper)](#oracle-bookkeeper)
  - [Features](#features)
  - [Local setup and running tests](#local-setup-and-running-tests)
    - [Install](#install)
    - [Build](#build)
    - [Running test](#running-test)

## Repository structure

```
  +-------------------+       1       +-------------------+
  |   FactoryContract |--------------->| `Pool Contracts`  |
  +-------------------+     0..*      +-------------------+
                                      | - BookKeeper: BookKeeperContract
                                      | - repository: Repository
                                      |
                                      |    1             +----------------+
                                      +----------------->|  `BookKeeper`  |
                                      |                  +----------------+
                                      |
                                      |
                                      |
                                      |
                                      |     1           +----------------+
                                      +---------------->| `Repository` |
                                                        +----------------+
```

FactoryContract is connected to multiple PoolContract instances with a "1 to 0 or more" relationship.
- A pool contract instance is not a contract back instead a collection of two contracts, one being the `Repository`, the other being the `BookKeeper`.

Each PoolContract has a one-to-one relationship with both BookKeeperContract and Repository contracts.

### BookKeeper

The BookKeeper contract is a contract that is used to keep track of the balances of the repositories. It is used to keep track of the balances of the repositories and to keep track of the total supply of the repository tokens.

- The BookKeeper relies on an oracle to give accurate information
- An improvement would be having cooldowns etc to prevent incorrect readings from the oracle
- Obvious issue is that this is a major point of centeralisation and a single point of failure

### Repository

The Repository contract is a contract that is used to store the funds that have been deposited by users for trading given a particular strategy.

- The redeemeable amounts from the repository are dependent on the oracle's NAV inputs

### Controller

The controller is an off chain bot that executes the stratergy for a repository. 

### Oracle (BookKeeper)

The oracle provides periodic updates to the BookKeeper contract. The oracle is a trusted source of information and is used to provide the BookKeeper with the NAV of the repository.

[UML Diagram](./tokeRepo.drawio.png)

## Features

## Local setup and running tests

### Install

```js
$ yarn
```

### Build

```js
$ yarn build
```

### Running test

```
$ yarn test
```

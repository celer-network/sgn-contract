# SGN contracts

[![CircleCI](https://circleci.com/gh/celer-network/sgn-contract/tree/master.svg?style=svg)](https://circleci.com/gh/celer-network/sgn-contract/tree/master)

Mainchain smart contracts for [Celer state guardian network (SGN)](https://www.celer.network/docs/celercore/sgn/architecture.html)

## Test locally

1. Install [NodeJS](https://nodejs.org) v10.

2. Install the node dependencies:

```sh
npm install
```

3. Install truffle and ganache-cli (`sudo` permission might be needed):

```sh
npm install -g truffle ganache-cli
```

4. Run ganache-cli:

```sh
ganache-cli --gasLimit 8000000 --accounts 20
```

5. Use truffle to run tests:

```sh
truffle test
```

## Prepare artifact JSON files for sgn-explorer

1. Compile the contracts:

```sh
npx truffle migrate
```

2. Edit the "networks" field in the artifact JSON files. Eg. `build/contracts/DPos.json`.

3. Copy the artifacts to the sgn-explorer directory:

```sh
cp build/contracts/CELRToken.json build/contracts/DPoS.json build/contracts/SGN.json <path-to-sgn-explorer-repo>/src/contracts
```

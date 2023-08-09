# ScieNFT Blockchain Contracts

The ScieNFT contracts serve as the backbone of our decentralized preprint server, enabling the
minting, trading, and management of NFTs representing scientific work. This repository contains the
core smart contracts and some utility scripts for interacting with them.

#### Tokens

An ERC20 and ERC1155 compatible contract managing NFTs representing scientific work and the SCI
utility token.

#### Listings

A marketplace contract that holds ERC1155 NFTs for sale.

#### Offers

A marketplace contract that holds fungible tokens on offer for an NFT.

### Avalanche C-Chain Addresses

The contracts were deployed to the Avalanche C-Chain on August 4, 2023.

| Contract Name | Contract Address                           | Link                                                                            |
| ------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| Tokens        | 0xbefd8ddc159abaa4a4b7e1b8b77ed1171b26ab47 | [View](https://snowtrace.io/address/0xbefd8ddc159abaa4a4b7e1b8b77ed1171b26ab47) |
| Offers        | 0x65841098e591baff9e931700bc5c5423d7e534d3 | [View](https://snowtrace.io/address/0x65841098e591baff9e931700bc5c5423d7e534d3) |
| Listings      | 0xeada9c401421c00623df426b11c83e126965e1bd | [View](https://snowtrace.io/address/0xeada9c401421c00623df426b11c83e126965e1bd) |

### Generated Documentation

| Tool                  | Link                                                  |
| --------------------- | ----------------------------------------------------- |
| hardhat-docgen        | [View](https://scienft.github.io/contracts/#/)        |
| solidity-code-metrics | [View](https://scienft.github.io/contracts/metrics/)  |
| solidity-coverage     | [View](https://scienft.github.io/contracts/coverage/) |

## Setting up the .env file to run tests

The environment file must supply a private key and some contract parameters in order to run the unit
tests with hardhat.

First, copy the sample file to a new .env file:

```shell
cp .env.example .env
```

We use secret shares to store our deployment private key and wanted to include it here as an example
for other projects. This adds a small amount of extra work before you can run the unit tests.

Generate a new set of six secret shares for your .env file:

```shell
npx ts-node ./tools/secretShares.ts
```

Copy the result into your `.env` file. (These are meaningless example values.)

```
DEPLOYING_SHARE_1="school gravity science delay ..."
DEPLOYING_SHARE_2="coast fetch win please filter ..."
DEPLOYING_SHARE_3="dynamic radar science stick drift ..."
DEPLOYING_SHARE_4="angry join balcony sibling material ..."
DEPLOYING_SHARE_5="jungle process unknown lady cinnamon ..."
DEPLOYING_SHARE_6="next enroll festival vintage cart ..."
```

Any three of the six entries is sufficient to rebuild the private key from the secret shares.

The script will also print out the first 10 receiving addresses that belong to the private key the
secret shares define.

## Running the Unit Tests

Ensure the integrity and correctness of the contracts by running the unit tests:

```shell
yarn install
yarn run test
```

To report coverage, use `yarn run coverage`.

## Setting up the .env file to mine SCI tokens

You must supply the private key for the account you want to use with the mining scripts. If you
copied the `env.example` file you can edit the value for `USER_WALLET_MNEMONIC` to your preferred
private key mnemonic.

If you want to generate a new wallet for mining, you can run:

```shell
npx ts-node ./tools/newWallet.ts
```

If you have a hex private key, you should be able to slightly modify this script to change it to a
set of mnemonic words.

## Mining SCI tokens

To mine SCI tokens, provide your private key mnemonic to your `.env` file and run the mining script:

```shell
yarn run checkBalance:fuji
yarn run mine:fuji
```

or to mine on the mainnet:

```shell
yarn run checkBalance:avalanche
yarn run mine:avalanche
```

Note that your account must have sufficent AVAX tokens to cover the mining operation. You can
request fuji testnet AVAX using the faucet at https://core.app/en/tools/testnet-faucet

# ScieNFT Blockchain Contracts

This project contains the solidity contracts used by ScieNFT, and a gRPC microservice using Nest.js.

### Tokens

An ERC20 and ERC1155 compatible contract managing NFTs representing scientific work and the SCI
utility token.

### Listings

A marketplace contract that holds ERC1155 NFTs for sale.

### Offers

A marketplace contract that holds fungible tokens on offer for an NFT.

## Unit Tests

To run the unit tests on the contracts:

```shell
yarn install
yarn run test
```

To measure coverage, use `yarn run coverage`.

Note that 100% branch coverage is only possible for the Tokens contract if the `testInternal`
function is uncommented. This fuction exposes private methods so that we can verify that these
functions revert in some circumstances.

## Local deployment to the HardHat blockchain (31337)

First build the code and then launch a local hardhat node:

```shell
yarn install
yarn run build
yarn run start
```

In a second terminal, run the deploy script:

```shell
yarn run deploy:local
```

In a third terminal, start the RPC service:

```shell
yarn run nest:start:local
```

Finally, you can run the integration tests:

```shell
yarn run e2etest
```

## Remote deployment to the Avalanche Fuji testnet

Note that the `deployAll` script provides a flag to control redeploying the contracts:

```typescript
const USE_DEPLOYED_CONTRACTS = true;
```

Unless you are testing changes to the solidity code, you should be able to make use of contracts
previously deployed to the Fuji Testnet. The file `deployment.config.43113.json` provides the
following values to the nest RPC microservice:

```json
{
  "tokensAddress": "0x2ed1d97F7F97b2f5f4b646D12678efF822aeeB9e",
  "offersAddress": "0x6B801a3ED9CB45A7CF052d6AC377eC4cb718cf5C",
  "listingsAddress": "0x4E0C09b2c82BBB0A1e696943853a6253B51dF316",
  "chainId": 43113,
  "url": "https://api.avax-test.network/ext/bc/C/rpc"
}
```

This file is overwritten if the contracts are redeployed. The deployed contracts have the following
roles:

```
TOKENS:CEO_ROLE           0x574B8c3df7413c5873F99422db020835712e9770
TOKENS:CFO_ROLE           0x16AAC494f71c836034B4e8e8AB09BF45a9C8f68A
TOKENS:SUPERADMIN_ROLE    0xB86966AaE3144b21d564C1460Ac11d2EA4893793
TOKENS:MARKETPLACE_ROLE   0x0E2F8784dc05b8375661a26cA0af8cc9522631Bd
TOKENS:MARKETPLACE_ROLE   0xA459e907fD702D0e5953D6b0FF3F73bCb817Bc78
OFFERS:CEO_ROLE           0x574B8c3df7413c5873F99422db020835712e9770
OFFERS:CFO_ROLE           0x16AAC494f71c836034B4e8e8AB09BF45a9C8f68A
OFFERS:SUPERADMIN_ROLE    0xB86966AaE3144b21d564C1460Ac11d2EA4893793
LISTINGS:CEO_ROLE         0x574B8c3df7413c5873F99422db020835712e9770
LISTINGS:CFO_ROLE         0x16AAC494f71c836034B4e8e8AB09BF45a9C8f68A
LISTINGS:SUPERADMIN_ROLE  0xB86966AaE3144b21d564C1460Ac11d2EA4893793
```

The SUPERADMIN_ROLE is used to send transactions on behalf of custodied user wallets and must
maintain a positive balance of AVAX gas tokens.

### TestNet Gas Tokens

Load testnet AVAX from the faucet at https://faucet.avax.network/

### Deploying

```shell
yarn install
yarn run build
yarn run deploy:fuji
yarn run nest:start:fuji
yarn run e2etest
```

## Remote deployment to the Avalanche C-Chain Mainnet

The mainnet ScieNFT contracts were deployed to the Avalanche C-Chain on August 4, 2023.

```json
{
  "tokensAddress": "0xBefD8dDC159ABAa4A4B7E1B8B77ed1171B26Ab47",
  "offersAddress": "0x65841098e591baff9E931700bc5C5423d7E534d3",
  "listingsAddress": "0xeAda9C401421C00623df426b11c83e126965e1bd",
  "chainId": 43114,
  "url": "https://api.avax.network/ext/bc/C/rpc"
}
```

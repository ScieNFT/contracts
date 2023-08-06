# ScieNFT Blockchain Contracts

This project contains the solidity contracts used by ScieNFT.

These contracts were deployed to the Avalanche C-Chain on August 4, 2023.

```json
{
  "tokensAddress": "0xBefD8dDC159ABAa4A4B7E1B8B77ed1171B26Ab47",
  "offersAddress": "0x65841098e591baff9E931700bc5C5423d7E534d3",
  "listingsAddress": "0xeAda9C401421C00623df426b11c83e126965e1bd",
  "chainId": 43114,
  "url": "https://api.avax.network/ext/bc/C/rpc"
}
```

### Tokens

An ERC20 and ERC1155 compatible contract managing NFTs representing scientific work and the SCI
utility token.

### Listings

A marketplace contract that holds ERC1155 NFTs for sale.

### Offers

A marketplace contract that holds fungible tokens on offer for an NFT.

## Docgen and Metrics

See https://scienft.github.io/contracts/#/ or https://scienft.github.io/contracts/#/metrics.html

## Running the Unit Tests

You must first setup the deployment key shares in your .env file:

```shell
npx ts-node ./tools/secretShares.ts
```

This will generate a new private key and print a set of six shares that you can copy and paste into
your .env file.

To run the unit tests on the contracts:

```shell
yarn install
yarn run test
```

To report coverage, use `yarn run coverage`.

## Mining SCI Tokens

To mine SCI tokens, you can provide your mnemonic to your `.env` file and run the mining script:

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

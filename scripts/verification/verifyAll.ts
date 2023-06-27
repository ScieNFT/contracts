// run with: npx hardhat --network fuji run scripts/verification/verifyAll.ts

import { join } from 'path';
import * as fs from 'fs';
import { run } from 'hardhat';
import dotenv from 'dotenv';
import hre from 'hardhat';
import { BigNumber } from 'ethers';

dotenv.config({ path: './.env' });

const deploymentFilePath = join(__dirname, '../../deployment.config.43113.json');
const deploymentJson = JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));

// from deployment scripts
let uri: string | undefined = process.env.METADATA_JSON_URI;
const CONTRACT_DEPLOYMENT_URI: string = uri ? uri : 'http://www.scienft.com/token-{id}.json';

let envInitialMiningYield: string | undefined = process.env.INITIAL_MINING_YIELD_SCI;
let initialMiningYield = BigNumber.from(envInitialMiningYield).mul(BigNumber.from(10).pow(18));

let envMinimumMiningYield: string | undefined = process.env.MINIMUM_MINING_YIELD_SCI;
let minimumMiningYield = BigNumber.from(envMinimumMiningYield).mul(BigNumber.from(10).pow(18));

let envMiningFee: string | undefined = process.env.MINING_FEE_GAS;
let miningFee = BigNumber.from(envMiningFee);

let envDifficulty: string | undefined = process.env.DIFFICULTY;
let difficulty = BigNumber.from(envDifficulty);

let envMiningIntervalSeconds: string | undefined = process.env.MINING_INTERVAL_SECONDS;
let miningIntervalSeconds = BigNumber.from(envMiningIntervalSeconds);

let envMaxTotalSupply: string | undefined = process.env.MAXIMUM_TOTAL_SUPPLY_SCI;
let maxTotalSupply = BigNumber.from(envMaxTotalSupply).mul(BigNumber.from(10).pow(18));

let envMintingFee: string | undefined = process.env.MINTING_FEE_GAS;
let mintingFee = BigNumber.from(envMintingFee);

let envListingFee: string | undefined = process.env.DEFAULT_LISTING_FEE_GAS;
const listingFee: number = envListingFee ? parseInt(envListingFee) : 0;

let envRoyaltyNumerator: string | undefined = process.env.DEFAULT_ROYALTY_NUMERATOR;
const royaltyNumerator: number = envRoyaltyNumerator ? parseInt(envRoyaltyNumerator) : 0;

// Map of contract names to constructor values
const constructorValuesMap: { [key: string]: any[] } = {
  Tokens: [
    CONTRACT_DEPLOYMENT_URI,
    initialMiningYield,
    minimumMiningYield,
    miningFee,
    difficulty,
    miningIntervalSeconds,
    maxTotalSupply,
    mintingFee,
  ],
  Offers: [deploymentJson.tokensAddress, listingFee, royaltyNumerator],
  Listings: [deploymentJson.tokensAddress, listingFee, royaltyNumerator],
};

// Map of contract names to contract addresses
const addressMap: { [key: string]: string } = {
  Tokens: deploymentJson.tokensAddress,
  Offers: deploymentJson.offersAddress,
  Listings: deploymentJson.listingsAddress,
};

// Define the contract names
const contractNames = ['Tokens', 'Listings', 'Offers'];

async function main() {
  console.log('Current Network:', hre.network.name);
  console.log('Chain ID:', hre.network.config.chainId);

  for (let contractName of contractNames) {
    console.log(`${contractName}.sol was deployed to ${addressMap[contractName]}\n`);
    //console.log(constructorValuesMap[contractName]);

    await run('verify:verify', {
      address: addressMap[contractName],
      constructorArguments: constructorValuesMap[contractName],
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

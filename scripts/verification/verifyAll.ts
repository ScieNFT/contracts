// run with: npx hardhat --network fuji run scripts/verification/verifyAll.ts

import { join } from 'path';
import * as fs from 'fs';
import { run } from 'hardhat';
import dotenv from 'dotenv';
import hre from 'hardhat';

dotenv.config({ path: './.env' });

const deploymentFilePath = join(__dirname, '../../deployment.config.43113.json');
const deploymentJson = JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));

// Map of contract names to constructor values
const constructorValuesMap: { [key: string]: (string | number)[] } = {
  Tokens: [
    process.env.METADATA_JSON_URI!, // uri_
    process.env.INITIAL_MINING_YIELD_SCI!, // initialMiningYield
    process.env.MINIMUM_MINING_YIELD_SCI!, // minimumMiningYield_
    process.env.MINING_FEE_GAS!, // miningFee_
    process.env.DIFFICULTY!, // difficulty_
    process.env.MINING_INTERVAL_SECONDS!, // miningIntervalSeconds_
    process.env.MAXIMUM_TOTAL_SUPPLY_SCI!, // maxTotalSupply_
    process.env.MINTING_FEE_GAS!, // mintingFee_
  ],
  Offers: [
    deploymentJson.tokensAddress, // tokensContractAddress
    process.env.DEFAULT_LISTING_FEE_GAS!, // offerFee_
    process.env.DEFAULT_ROYALTY_NUMERATOR!, // royaltyNumerator_
  ],
  Listings: [
    deploymentJson.tokensAddress, // tokensContractAddress
    process.env.DEFAULT_LISTING_FEE_GAS!, // listingFee_
    process.env.DEFAULT_ROYALTY_NUMERATOR!, // royaltyNumerator_
  ],
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
    console.log(`${contractName}.sol was deployed to ${addressMap[contractName]}`);
    // console.log(constructorValuesMap[contractName]);
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

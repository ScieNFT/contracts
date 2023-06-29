const ethers = require('ethers');
const fs = require('fs');
const path = require('path');
const { BigNumber } = require('ethers');

const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

const deploymentFilePath = path.join(__dirname, `../../deployment.config.43113.json`);
const deploymentJson = JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));

console.log(`The tokens contract was deployed to ${deploymentJson.tokensAddress}`);

// from deployment scripts
let uri = process.env.METADATA_JSON_URI;
const CONTRACT_DEPLOYMENT_URI = uri ? uri : 'http://www.scienft.com/token-{id}.json';

let envInitialMiningYield = process.env.INITIAL_MINING_YIELD_SCI;
let initialMiningYield = BigNumber.from(envInitialMiningYield).mul(BigNumber.from(10).pow(18));

let envMinimumMiningYield = process.env.MINIMUM_MINING_YIELD_SCI;
let minimumMiningYield = BigNumber.from(envMinimumMiningYield).mul(BigNumber.from(10).pow(18));

let envMiningFee = process.env.MINING_FEE_GAS;
let miningFee = BigNumber.from(envMiningFee);

let envDifficulty = process.env.DIFFICULTY;
let difficulty = BigNumber.from(envDifficulty);

let envMiningIntervalSeconds = process.env.MINING_INTERVAL_SECONDS;
let miningIntervalSeconds = BigNumber.from(envMiningIntervalSeconds);

let envMaxTotalSupply = process.env.MAXIMUM_TOTAL_SUPPLY_SCI;
let maxTotalSupply = BigNumber.from(envMaxTotalSupply).mul(BigNumber.from(10).pow(18));

let envMintingFee = process.env.MINTING_FEE_GAS;
let mintingFee = BigNumber.from(envMintingFee);

let envListingFee = process.env.DEFAULT_LISTING_FEE_GAS;
const listingFee = envListingFee ? parseInt(envListingFee) : 0;

let envRoyaltyNumerator = process.env.DEFAULT_ROYALTY_NUMERATOR;
const royaltyNumerator = envRoyaltyNumerator ? parseInt(envRoyaltyNumerator) : 0;

// Map of contract names to constructor values
const constructorValuesMap = {
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

// Define the contract names
const contractNames = ['Tokens', 'Listings', 'Offers'];

for (let contractName of contractNames) {
  // Read and parse the contract JSON
  const contractJsonPath = path.join(
    __dirname,
    `../../artifacts/contracts/${contractName}.sol/${contractName}.json`
  );
  const contractJson = JSON.parse(fs.readFileSync(contractJsonPath, 'utf8'));

  // Your ABI
  const abi = contractJson.abi;

  // Get the constructor inputs from the ABI.
  const constructorInterface = abi.find((item) => item.type === 'constructor');

  // Get constructor values for the current contract
  const constructorValues = constructorValuesMap[contractName];

  // Encode the values
  const encodedConstructorArgs = ethers.utils.defaultAbiCoder.encode(
    constructorInterface.inputs.map((input) => input.type),
    constructorValues
  );

  console.log(`\nABI encoded constructor arguments for ${contractName}.sol\n`);

  // Remove the '0x' prefix
  const encodedConstructorArgsWithoutPrefix = encodedConstructorArgs.substring(2);

  console.log(encodedConstructorArgsWithoutPrefix);
}
console.log('\n');

// https://abi.hashex.org/ is also useful here

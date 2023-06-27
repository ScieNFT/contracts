const ethers = require('ethers');
const fs = require('fs');
const path = require('path');

const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

const deploymentFilePath = path.join(__dirname, `../../deployment.config.43113.json`);
const deploymentJson = JSON.parse(fs.readFileSync(deploymentFilePath, 'utf8'));

console.log(`The tokens contract was deployed to ${deploymentJson.tokensAddress}`);

// Map of contract names to constructor values
const constructorValuesMap = {
  Tokens: [
    process.env.METADATA_JSON_URI, // uri_
    process.env.INITIAL_MINING_YIELD_SCI, // initialMiningYield
    process.env.MINIMUM_MINING_YIELD_SCI, // minimumMiningYield_
    process.env.MINING_FEE_GAS, // miningFee_
    process.env.DIFFICULTY, // difficulty_
    process.env.MINING_INTERVAL_SECONDS, // miningIntervalSeconds_
    process.env.MAXIMUM_TOTAL_SUPPLY_SCI, // maxTotalSupply_
    process.env.MINTING_FEE_GAS, // mintingFee_
  ],
  Offers: [
    deploymentJson.tokensAddress, // tokensContractAddress
    process.env.DEFAULT_LISTING_FEE_GAS, // offerFee_
    process.env.DEFAULT_ROYALTY_NUMERATOR, // royaltyNumerator_
  ],
  Listings: [
    deploymentJson.tokensAddress, // tokensContractAddress
    process.env.DEFAULT_LISTING_FEE_GAS, // listingFee_
    process.env.DEFAULT_ROYALTY_NUMERATOR, // royaltyNumerator_
  ],
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

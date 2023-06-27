const fs = require('fs');
const path = require('path');
const execSync = require('child_process').execSync;

// Define the contract names
const contractNames = ['Tokens', 'Listings', 'Offers'];

for (let contractName of contractNames) {
  // Define the paths
  const contractPath = path.join(__dirname, `../../contracts/${contractName}.sol`);
  const flattenedPath = path.join(__dirname, `../../flattened/${contractName}.sol`);

  // Execute the flattening command
  execSync(`npx hardhat flatten ${contractPath} > ${flattenedPath}`);

  // Read the flattened contract
  let contract = fs.readFileSync(flattenedPath, 'utf8');

  // Remove all SPDX license identifiers
  contract = contract.replace(/\/\/ SPDX-License-Identifier: MIT/g, '');

  // Add one SPDX license identifier at the top
  contract = '// SPDX-License-Identifier: MIT\n' + contract;

  // Write the modified contract back to the file
  fs.writeFileSync(flattenedPath, contract);
}

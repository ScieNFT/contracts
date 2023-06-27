const fs = require('fs');
const path = require('path');

const artifactDir = path.join(__dirname, `../../artifacts/build-info/`);
const artifactFile = fs.readdirSync(artifactDir)[0]; // Take the first file
const artifactPath = path.join(artifactDir, artifactFile);

const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

console.log(`The contract was compiled with Solidity ${artifact.solcLongVersion}`);

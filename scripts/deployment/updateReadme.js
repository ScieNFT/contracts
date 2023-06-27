const fs = require('fs');
const execSync = require('child_process').execSync;

const readmeFilePath = './README.md';
const newConfigFilePath = './deployment.config.43113.json';
execSync(`yarn run format`);

// Read the contents of the README.md file
fs.readFile(readmeFilePath, 'utf8', (err, data) => {
  let blockToReplace = '';

  if (err) {
    console.error(`Error reading ${readmeFilePath}:`, err);
    return;
  }
  // Extract the captured text using the regex pattern
  const regexPattern = /(?:\Avalanche Fuji testnet[\s\S]*?```json\n)([\s\S]*?)(?=\n```\n)/;
  const match = regexPattern.exec(data);
  if (match && match[1]) {
    blockToReplace = match[1];
    console.log('Old configuration:');
    console.log(blockToReplace);
  } else {
    console.log('No match found.');
  }

  const newReadMeContents = data.replace(blockToReplace, () => {
    // Read the contents of the replacement config file
    try {
      const replacementConfig = fs.readFileSync(newConfigFilePath, 'utf8');
      console.log('New configuration:');
      console.log(replacementConfig);
      return replacementConfig;
    } catch (err) {
      console.error(`Error reading ${newConfigFilePath}:`, err);
      return '';
    }
  });

  // Write the modified contents back to the README.md file
  fs.writeFile(readmeFilePath, newReadMeContents, 'utf8', (err) => {
    if (err) {
      console.error(`Error writing to ${readmeFilePath}:`, err);
      return;
    }
    console.log('Replacement completed successfully!');

    // clean up extra space
    execSync(`yarn run format`);
  });
});

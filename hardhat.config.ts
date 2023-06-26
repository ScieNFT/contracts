// based on https://github.com/PaulRBerg/hardhat-template

import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-chai-matchers';

import * as dotenv from 'dotenv';
dotenv.config({ path: './.env' });

import 'hardhat-gas-reporter';
import 'hardhat-docgen';
import 'hardhat-abi-exporter';

import '@typechain/hardhat';
import '@nomiclabs/hardhat-ethers';
import 'solidity-coverage';

import type { NetworkUserConfig } from 'hardhat/types';

// Ensure that we have all the environment variables we need.
const mnemonic = process.env.DEPLOYING_MNEMONIC;
if (!mnemonic) {
  throw new Error('Please set your DEPLOYING_MNEMONIC in a .env file');
}

const chainIds = {
  avalanche: 43112,
  fuji: 43113,
  hardhat: 31337,
};

function getChainConfig(chain: keyof typeof chainIds): NetworkUserConfig {
  let config = {
    accounts: {
      count: 20,
      mnemonic,
      path: "m/44'/60'/0'/0",
    },
    chainId: chainIds[chain],
    url: '',
  };

  switch (chain) {
    case 'avalanche':
      config.url = 'https://api.avax.network/ext/bc/C/rpc';
      break;
    case 'fuji':
      config.url = 'https://api.avax-test.network/ext/bc/C/rpc';
      break;
  }
  return config;
}

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  etherscan: {
    apiKey: {
      avalanche: process.env.SNOWTRACE_API_KEY || '',
    },
  },
  gasReporter: {
    currency: 'USD',
    enabled: true,
    gasPrice: 25,
    token: 'AVAX',
    coinmarketcap: process.env.COINMARKETCAP_API_KEY || '',
    excludeContracts: [],
    src: './contracts',
  },
  networks: {
    avalanche: getChainConfig('avalanche'),
    fuji: getChainConfig('fuji'),
    hardhat: {
      accounts: {
        mnemonic,
      },
      chainId: chainIds.hardhat,
    },
  },
  paths: {
    artifacts: './artifacts',
    cache: './cache',
    sources: './contracts',
    tests: './test',
  },
  solidity: {
    version: '0.8.17',
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/hardhat-template/issues/31
        bytecodeHash: 'none',
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 800,
      },
    },
  },
  docgen: {
    path: './doc',
    clear: true,
    runOnCompile: true,
  },
  typechain: {
    outDir: 'types',
    target: 'ethers-v5',
    alwaysGenerateOverloads: false,
    dontOverrideCompile: false,
  },
  mocha: {
    timeout: 600_000 /* 10 minutes */,
  },
  abiExporter: {
    runOnCompile: true,
    flat: true,
    clear: true,
  },
};
export default config;

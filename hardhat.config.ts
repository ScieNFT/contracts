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

// Ensure that we have all the environment variables we need.
const mnemonic = process.env.DEPLOYING_MNEMONIC;
if (!mnemonic) {
  throw new Error('Please set your DEPLOYING_MNEMONIC in a .env file');
}

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  etherscan: {
    apiKey: {
      avalanche: process.env.SNOWTRACE_API_KEY!,
      fuji: process.env.SNOWTRACE_API_KEY!,
    },
    customChains: [
      {
        network: 'fuji',
        chainId: 43113,
        urls: {
          apiURL: 'https://api.avax-test.network/ext/bc/C/rpc',
          browserURL: 'https://testnet.snowtrace.io',
        },
      },
      {
        network: 'avalanche',
        chainId: 43114,
        urls: {
          apiURL: 'https://api.avax.network/ext/bc/C/rpc',
          browserURL: 'https://snowtrace.io',
        },
      },
    ],
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
    avalanche: {
      accounts: {
        count: 20,
        mnemonic,
        path: "m/44'/60'/0'/0",
      },
      gasPrice: 225000000000,
      chainId: 43114,
      url: 'https://api.avax.network/ext/bc/C/rpc',
    },
    fuji: {
      accounts: {
        count: 20,
        mnemonic,
        path: "m/44'/60'/0'/0",
      },
      gasPrice: 225000000000,
      chainId: 43113,
      url: 'https://api.avax-test.network/ext/bc/C/rpc',
    },
    hardhat: {
      accounts: {
        mnemonic,
      },
      chainId: 31337,
    },
  },
  paths: {
    artifacts: './artifacts',
    cache: './cache',
    sources: './contracts',
    tests: './test',
  },
  solidity: {
    version: '0.8.19',
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

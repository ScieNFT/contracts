// https://github.com/NomicFoundation/hardhat/issues/2175
// `ts-node ...` doesn't work -- instead use `npx hardhat run`

import hre from 'hardhat';

import { Contract } from 'ethers';
import { Tokens__factory } from '../types/factories/contracts/Tokens__factory';
import type { Tokens as Tokens__contract } from '../types/contracts/Tokens';

import { join } from 'path';
import { readFileSync } from 'fs';

import { Wallet } from 'ethers';

let TOKENS: Tokens__contract;
let USER: Wallet;

export async function connect() {
  // build signer

  let m = process.env.USER_WALLET_MNEMONIC || '';

  if (!m) {
    console.error('Could not find USER_WALLET_MNEMONIC');
    throw new Error('Please set USER_WALLET_MNEMONIC in the .env file');
  }

  let provider = (hre as any).ethers.provider;
  USER = Wallet.fromMnemonic(m, `m/44'/60'/0'/0/0`).connect(provider);

  // connect to the deployed tokens contract

  let tokensFactory: Tokens__factory = <Tokens__factory>(
    await hre.ethers.getContractFactory('Tokens', USER)
  );

  const config = hre.network.config;
  let chainId = config.chainId ? config.chainId : '31337';
  const content = readFileSync(join(__dirname, `../deployment.config.${chainId}.json`), 'utf-8');
  let data = JSON.parse(content);
  console.log(`Using existing Tokens Contract @ ${data.tokensAddress}`);

  TOKENS = <Tokens__contract>new Contract(data.tokensAddress, tokensFactory.interface, USER);

  console.log(`>>> Tokens Address = ${TOKENS.address}`);
}

async function main() {
  await connect();
  const gasBalance = await USER.getBalance();
  const sciBalance = await TOKENS['balanceOf(address)'](USER.address);
  console.log(`Address ${USER.address}: ${gasBalance} attoAVAX, ${sciBalance} attoSCI`);
}

if (require.main === module) {
  main();
}

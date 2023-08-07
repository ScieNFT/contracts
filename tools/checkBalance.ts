// https://github.com/NomicFoundation/hardhat/issues/2175
// `ts-node ...` doesn't work -- instead use `npx hardhat run`

import hre from 'hardhat';

import { Contract } from 'ethers';
import { Tokens__factory } from '../types/factories/contracts/Tokens__factory';
import type { Tokens as Tokens__contract } from '../types/contracts/Tokens';

import { join } from 'path';
import { readFileSync } from 'fs';

import { Wallet, BigNumber } from 'ethers';

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
}

async function main() {
  await connect();
  const gasBalance = await USER.getBalance();
  const sciBalance = await TOKENS['balanceOf(address)'](USER.address);
  console.log(
    `address ${USER.address} controls ${gasBalance} attoAVAX and ${sciBalance} attoSCI\n`
  );

  // report on current mining yield
  const miningYield = await TOKENS.miningYield();
  const miningCount = await TOKENS.miningCount();
  console.log(`Mining will yield ${miningYield} attoSCI for the next ${miningCount} calls`);

  const miningFee = await TOKENS.miningFee();

  const miningGas = 60976;
  const gasPrice = await USER.provider.getGasPrice();
  const txFee = gasPrice.mul(miningGas);

  const oneAVAX = BigNumber.from(10).pow(18);

  const k = 10000000000;
  const txFeeFloat = parseFloat(txFee.mul(k).div(oneAVAX).toString()) / k;
  console.log(`The mining transaction gas fee is currently ${txFeeFloat} AVAX per call.`);

  const miningFeeFloat = parseFloat(miningFee.mul(k).div(oneAVAX).toString()) / k;
  console.log(`The mining fee is currently ${miningFeeFloat} AVAX per call.`);

  const exchangeRateFloat = parseFloat(miningFee.add(txFee).mul(k).div(miningYield).toString()) / k;
  console.log(`The effective mining cost is ${exchangeRateFloat} AVAX/SCI\n`);

  const totalSupply = await TOKENS.totalSupply();
  const totalSupplyFloat = parseFloat(totalSupply.mul(k).div(oneAVAX).toString()) / k;

  const maxSupply = await TOKENS.maxTotalSupply();
  const maxSupplyFloat = parseFloat(maxSupply.mul(k).div(oneAVAX).toString()) / k;
  const minedPercent = ((totalSupplyFloat / maxSupplyFloat) * 100).toFixed(1);

  console.log(
    `To date ${totalSupplyFloat} of ${maxSupplyFloat} SCI have been mined (${minedPercent}%)`
  );
  console.log(
    `Mining implies a current market cap of ${totalSupplyFloat * exchangeRateFloat} AVAX`
  );
}

if (require.main === module) {
  main();
}

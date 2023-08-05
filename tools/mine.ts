// https://github.com/NomicFoundation/hardhat/issues/2175
// `ts-node ...` doesn't work -- instead use `npx hardhat run`

import hre from 'hardhat';

import { Contract } from 'ethers';
import { Tokens__factory } from '../types/factories/contracts/Tokens__factory';
import type { Tokens as Tokens__contract } from '../types/contracts/Tokens';

import { join } from 'path';
import { readFileSync } from 'fs';

import { BigNumber, BytesLike, utils, Wallet } from 'ethers';
import { randomBytes } from 'crypto';

import { keccak256 } from 'js-sha3';

import process from 'process';

let TOKENS: Tokens__contract;
let USER: Wallet;

export class Nonce {
  static NONCE: number;

  public static async resetNonce() {
    let next = await USER.provider.getTransactionCount(USER.address, 'pending');
    Nonce.NONCE = next;
    console.log(`[NONCE] set first nonce to ${Nonce.NONCE}`);
  }

  public static async get() {
    if (!Nonce.NONCE) {
      await Nonce.resetNonce();
    } else {
      Nonce.NONCE += 1;
      console.log(`[NONCE] providing nonce = ${Nonce.NONCE}`);
    }
    return { nonce: Nonce.NONCE };
  }
}

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

const chainId = `${hre.network.config.chainId}` || '31337';
const snowtrace =
  chainId == '43113'
    ? 'https://testnet.snowtrace.io/tx/'
    : '43114'
    ? 'https://snowtrace.io/tx/'
    : '';

export async function mineSCI(tokensAddress: string, maximumMiningOperations: number) {
  if (!tokensAddress) {
    throw new Error('mineSCI requires Tokens from deploy.service');
  } else {
    console.log(`mining SCI for Tokens at ${tokensAddress}`);
  }
  // Mining SCI tokens
  let miningFee = await TOKENS.miningFee();
  console.log(`miningFee = ${miningFee.toString()} [$]`);

  let difficulty = await TOKENS.difficulty();
  console.log(`difficulty = ${difficulty.toString()} [zeroes]`);

  let miningIntervalSeconds = await TOKENS.miningIntervalSeconds();
  console.log(`interval = ${miningIntervalSeconds.toString()} [sec]`);

  async function checkSolution(solution: BytesLike): Promise<BytesLike> {
    let solutionIterations = 0;
    let done = await TOKENS.isCorrect(solution);
    while (!done) {
      solutionIterations++;
      solution = randomBytes(32);
      done = await TOKENS.isCorrect(solution);
    }
    if (solutionIterations > 0) {
      console.log(`checked ${solutionIterations} hashes against the contract`);
    }
    return solution;
  }

  async function mine(): Promise<BytesLike> {
    let solution: BytesLike = randomBytes(32);
    return await checkSolution(solution);
  }

  function predict(lastSolution: BytesLike): BytesLike {
    let solution: BytesLike = randomBytes(32);
    let remainingDifficulty = difficulty;
    while (remainingDifficulty > 0) {
      let concatenated = Buffer.concat([
        Buffer.from(utils.arrayify(lastSolution)),
        Buffer.from(utils.arrayify(solution)),
      ]);
      let hash = keccak256(concatenated);
      let x = BigNumber.from('0x' + hash);
      for (let i = 255; i >= 0; i--) {
        if (x.shr(i).and(1).isZero()) {
          remainingDifficulty -= 1;
          if (remainingDifficulty === 0) {
            break;
          }
        } else {
          // start over
          solution = randomBytes(32);
          remainingDifficulty = difficulty;
          break;
        }
      }
    }
    return solution;
  }

  let miningIterations = 0;
  let minimumMiningTimeMsec = miningIntervalSeconds * 1000;
  let totalMiningTimeMsec = 0;

  let lastSolution = await mine();
  let t0 = Date.now();
  while (miningIterations < maximumMiningOperations) {
    try {
      let start = Date.now();

      let miningYieldPromise = TOKENS.miningYield();
      let solutionPromise = checkSolution(predict(lastSolution));
      let [miningYield, solution, _] = await Promise.all([miningYieldPromise, solutionPromise]);
      lastSolution = solution;
      console.log(`[${Date.now() - t0}] setup: ${Date.now() - start} msec`);

      let tx = await TOKENS.connect(USER).mineSCI(solution, USER.address, {
        value: miningFee.toString(),
        nonce: (await Nonce.get()).nonce,
        gasLimit: 200000,
      });

      console.log(`[${Date.now() - t0}] ${snowtrace}${tx.hash}  [ sent ]`);

      let receipt = await tx.wait();
      miningIterations++;
      console.log(`[${Date.now() - t0}] ${snowtrace}${tx.hash}  [ status ${receipt.status} ]`);
      console.log(
        `[${Date.now() - t0}] mined ${miningYield.div(BigNumber.from(10).pow(18))} SCI to ${
          USER.address
        } (${miningIterations} of ${maximumMiningOperations})`
      );

      let elapsedTimeMsec = Date.now() - start;
      if (elapsedTimeMsec < minimumMiningTimeMsec) {
        let extraDelayMsec = minimumMiningTimeMsec - elapsedTimeMsec;
        console.log(`[${Date.now() - t0}] delay: ${extraDelayMsec} msec`);
        await new Promise((r) => setTimeout(r, extraDelayMsec));
      }

      totalMiningTimeMsec += elapsedTimeMsec;
      if (miningIterations > 0) {
        console.log(`average loop time is ${totalMiningTimeMsec / miningIterations} msec`);
      }
    } catch (error) {
      if (error.code === 'NETWORK_ERROR') {
        console.log('No network connection!');
        console.error(error);
        process.exit(1); // 1 indicates an error. 0 would be a successful exit.
      } else if (error.code === 'INSUFFICIENT_FUNDS') {
        console.log('Insufficient funds to continue mining!');
        console.error(error);
        process.exit(1);
      } else if (error.code === 'CALL_EXCEPTION' || error.code === 'SERVER_ERROR') {
        minimumMiningTimeMsec += 200; // slow down
        console.log(
          `\n[${Date.now() - t0}] ${
            error.code
          } DETECTED - increased mining time to ${minimumMiningTimeMsec} msec`
        );
      } else {
        console.error(error);
        process.exit(1);
      }
    }
  }
  let balance = await TOKENS['balanceOf(address)'](USER.address);
  console.log(
    `[${Date.now()}] mining is complete. Your SCI balance is now ${balance.div(
      BigNumber.from(10).pow(18)
    )} SCI`
  );
}

async function main() {
  await connect();
  let miningOperations = 1;

  let gasBalance = await USER.getBalance();
  let sciBalance = await TOKENS['balanceOf(address)'](USER.address);
  console.log(`Address ${USER.address}: ${gasBalance} attoAVAX, ${sciBalance} attoSCI`);

  await mineSCI(TOKENS.address, miningOperations).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

  gasBalance = await USER.getBalance();
  sciBalance = await TOKENS['balanceOf(address)'](USER.address);
  console.log(`Address ${USER.address}: ${gasBalance} attoAVAX, ${sciBalance} attoSCI`);
}

if (require.main === module) {
  main();
}

import hre from 'hardhat';
import { BigNumber, BytesLike } from 'ethers';
import { randomBytes } from 'crypto';

import process from 'process';
var args = process.argv;

const chainId = `${hre.network.config.chainId}` || '31337';
const snowtrace =
  chainId == '43113'
    ? 'https://testnet.snowtrace.io/tx/'
    : '43114'
    ? 'https://snowtrace.io/tx/'
    : '';

import { Nonce, Signers, Contracts } from './deploy.service';

export async function mineSCI(tokensAddress: string, maximumMiningOperations: number) {
  if (!tokensAddress) {
    throw new Error('mineSCI requires Tokens from deploy.service');
  } else {
    console.log(`mining SCI for Tokens at ${tokensAddress}`);
  }
  // Mining SCI tokens
  let miningFee = await Contracts.tokens.miningFee();
  console.log(`miningFee = ${miningFee} [$]`);

  let miningIntervalSeconds = await Contracts.tokens.miningIntervalSeconds();
  let miningIterations = 0;

  async function mine(): Promise<BytesLike> {
    // if we try to mine too quickly, we will loop and submit again
    let done = false;
    let solutionIterations = 0;
    let solution: BytesLike = randomBytes(32);
    while (!done) {
      solutionIterations++;
      solution = randomBytes(32);
      done = await Contracts.tokens.isCorrect(solution);
    }
    console.log(`calculated ${solutionIterations} hashes to find a solution`);
    return solution;
  }

  const scale = BigNumber.from(10).pow(18);

  async function withdrawFeesToCEO() {
    const gasBalanceCEO: BigNumber = await Signers.CEO.getBalance();
    let remainingMiningCalls = gasBalanceCEO.div(miningFee);
    console.log(
      `CEO gas covers about ${remainingMiningCalls} mining operations (${gasBalanceCEO.div(
        scale
      )}/${miningFee.div(scale)})`
    );

    if (remainingMiningCalls.lt(2)) {
      console.log(`withdrawing gas fees back to the CEO`);

      const nonce = (await Nonce.CFO()).nonce;
      const contractBalance = await Contracts.tokens['balanceOf(address)'](
        Contracts.tokens.address
      );
      let tx = await Contracts.tokens
        .connect(Signers.CFO)
        .withdraw(Signers.CEO.address, contractBalance, {
          nonce: nonce,
          gasLimit: 100000,
        });

      console.log(`tokens.withdrawFee ${snowtrace}${tx.hash}`);
      await tx.wait();
      const gasBalanceCEO: BigNumber = await Signers.CEO.getBalance();
      console.log(`**        CEO @ ${Signers.CEO.address} has ${gasBalanceCEO} gas`);
    }
  }

  let solution = await mine();
  let wait_tuning = 0;
  while (miningIterations < maximumMiningOperations) {
    try {
      let nonce = (await Nonce.CEO()).nonce;
      let tx = await Contracts.tokens.mineSCI(solution, Signers.CFO.address, {
        value: miningFee.toString(),
        nonce: nonce,
        gasLimit: 200000,
      });
      console.log(`tokens.mineSCI ${snowtrace}${tx.hash}`);
      // const blocktime = (await Contracts.tokens.provider.getBlock('latest')).timestamp;
      let miningYield = await Contracts.tokens.miningYield();
      console.log(
        `[${Date.now()}] mined ${miningYield.div(BigNumber.from(10).pow(18))} SCI to ${
          Signers.CFO.address
        } (${miningIterations + 1} of ${maximumMiningOperations})`
      );
      miningIterations++;
      let msecToWait = wait_tuning + miningIntervalSeconds * 1000;
      console.log(`[${Date.now()}] waiting ${msecToWait / 1000} seconds until next mining attempt`);
      await new Promise((r) => setTimeout(r, msecToWait));
      solution = await mine();

      await withdrawFeesToCEO();
    } catch (error) {
      if (error.code === 'NETWORK_ERROR') {
        console.log('No network connection!');
        console.error(error);
        process.exit(1); // 1 indicates an error. 0 would be a successful exit.
      } else if (error.code === 'INSUFFICIENT_FUNDS') {
        console.log('Insufficient funds to continue mining!');
        console.error(error);
        process.exit(1);
      } else {
        console.error(error);

        await new Promise((r) => setTimeout(r, 500));

        // wait longer next time
        wait_tuning += 500;
        console.log(
          `[${Date.now()}] mined too quickly! (adjusting extra delay to ${wait_tuning} msec)`
        );
      }
    }
  }
  let balance = await Contracts.tokens['balanceOf(address)'](Signers.CFO.address);
  console.log(
    `[${Date.now()}] mining is complete. CFO balance is now ${balance.div(
      BigNumber.from(10).pow(18)
    )}`
  );
}

if (require.main === module) {
  mineSCI(args[2], parseInt(args[3])).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

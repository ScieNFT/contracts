// use `npx hardhat run ...`

import hre from 'hardhat';
import { BigNumber, BytesLike, utils } from 'ethers';
import { randomBytes } from 'crypto';
import { deployAll } from '../scripts/deployment/deployAll';
import { printBalances, checkBalances } from './checkWallets';

import process from 'process';

const chainId = `${hre.network.config.chainId}` || '31337';
const snowtrace =
  chainId == '43113'
    ? 'https://testnet.snowtrace.io/tx/'
    : '43114'
    ? 'https://snowtrace.io/tx/'
    : '';

import { Nonce, Signers, Contracts } from '../scripts/deployment/deploy.service';

import { keccak256 } from 'js-sha3';

export async function mineSCI(tokensAddress: string, maximumMiningOperations: number) {
  if (!tokensAddress) {
    throw new Error('mineSCI requires Tokens from deploy.service');
  } else {
    console.log(`mining SCI for Tokens at ${tokensAddress}`);
  }
  // Mining SCI tokens
  let miningFee = await Contracts.tokens.miningFee();
  console.log(`miningFee = ${miningFee.toString()} [$]`);

  let difficulty = await Contracts.tokens.difficulty();
  console.log(`difficulty = ${difficulty.toString()} [zeroes]`);

  let miningIntervalSeconds = await Contracts.tokens.miningIntervalSeconds();
  console.log(`interval = ${miningIntervalSeconds.toString()} [sec]`);

  async function checkSolution(solution: BytesLike): Promise<BytesLike> {
    let solutionIterations = 0;
    let done = await Contracts.tokens.isCorrect(solution);
    while (!done) {
      solutionIterations++;
      solution = randomBytes(32);
      done = await Contracts.tokens.isCorrect(solution);
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

  async function withdrawFeesToCEO() {
    const gasBalanceCEO: BigNumber = await Signers.CEO.getBalance();
    let remainingMiningCalls = gasBalanceCEO.div(miningFee);

    function scaleGas(gas: BigNumber): string {
      let microGas = gas.div(BigNumber.from(10).pow(12)); // scale down to microgas units
      return (microGas.toNumber() / 1e6).toFixed(3);
    }

    console.log(
      `CEO gas covers about ${remainingMiningCalls} mining operations (${scaleGas(
        gasBalanceCEO
      )}/${scaleGas(miningFee)})`
    );

    if (remainingMiningCalls.lt(2)) {
      console.log(`withdrawing gas fees back to the CEO`);

      let provider = (hre as any).ethers.provider;
      const contractBalance = await provider.getBalance(Contracts.tokens.address);
      let tx = await Contracts.tokens
        .connect(Signers.CFO)
        .withdraw(Signers.CEO.address, contractBalance, {
          nonce: (await Nonce.CFO()).nonce,
          gasLimit: 100000,
        });

      console.log(`tokens.withdraw ${snowtrace}${tx.hash}`);
      await tx.wait();
      const gasBalanceCEO: BigNumber = await Signers.CEO.getBalance();
      console.log(`**        CEO @ ${Signers.CEO.address} has ${gasBalanceCEO} gas`);
    }
  }

  // requisition 80% of the gas owned by the SUPERADMIN for mining (restore after with allocation script)
  const gasBalanceSUPERADMIN = await Signers.SUPERADMIN.getBalance();

  let originalGasPrice = await Signers.SUPERADMIN.provider.getGasPrice();
  let gasPrice = originalGasPrice.mul(102).div(100);
  let txFee = BigNumber.from(21000);

  let gasToReserve = BigNumber.from('20000000000000000');

  if (gasBalanceSUPERADMIN.gt(gasToReserve)) {
    let gasToMove = gasBalanceSUPERADMIN.sub(gasToReserve);
    if (gasToMove.gt(0)) {
      console.log(`move ${gasToMove} gas from SUPERADMIN to CEO`);

      let tx = await Signers.SUPERADMIN.sendTransaction({
        to: Signers.CEO.address,
        value: gasToMove,
        gasPrice: gasPrice,
        gasLimit: txFee, // 21,000
        nonce: (await Nonce.SUPERADMIN()).nonce,
      });
      console.log(`transfer tx hash is ${tx.hash}`);
      await tx.wait();
    }
  }

  let miningIterations = 0;
  let minimumMiningTimeMsec = miningIntervalSeconds * 1000;
  let totalMiningTimeMsec = 0;

  let lastSolution = await mine();
  let t0 = Date.now();
  while (miningIterations < maximumMiningOperations) {
    try {
      let start = Date.now();
      let withdrawPromise = withdrawFeesToCEO();
      let miningYieldPromise = Contracts.tokens.miningYield();
      let solutionPromise = checkSolution(predict(lastSolution));
      let [miningYield, solution, _] = await Promise.all([
        miningYieldPromise,
        solutionPromise,
        withdrawPromise,
      ]);
      lastSolution = solution;
      console.log(`[${Date.now() - t0}] setup: ${Date.now() - start} msec`);

      let tx = await Contracts.tokens.connect(Signers.CEO).mineSCI(solution, Signers.CFO.address, {
        value: miningFee.toString(),
        nonce: (await Nonce.CEO()).nonce,
        gasLimit: 200000,
      });

      console.log(`[${Date.now() - t0}] ${snowtrace}${tx.hash}  [ sent ]`);

      let receipt = await tx.wait();
      miningIterations++;
      console.log(`[${Date.now() - t0}] ${snowtrace}${tx.hash}  [ status ${receipt.status} ]`);
      console.log(
        `[${Date.now() - t0}] mined ${miningYield.div(BigNumber.from(10).pow(18))} SCI to ${
          Signers.CFO.address
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
  let balance = await Contracts.tokens['balanceOf(address)'](Signers.CFO.address);
  console.log(
    `[${Date.now()}] mining is complete. CFO balance is now ${balance.div(
      BigNumber.from(10).pow(18)
    )} SCI`
  );
}

async function main() {
  let reuseOldContracts = true;
  let skipSetup = true;
  await deployAll(reuseOldContracts, skipSetup);

  let miningOperations = 128;

  await mineSCI(Contracts.tokens.address, miningOperations).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

  let balances = await checkBalances();
  printBalances(`BALANCES AFTER ${miningOperations} MINING OPERATIONS`, balances);
}

if (require.main === module) {
  main();
}

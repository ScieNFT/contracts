import hre from 'hardhat';

import { BigNumber, Contract } from 'ethers';
import { Tokens__factory } from '../../types/factories/contracts/Tokens__factory';
import type { Tokens as Tokens__contract } from '../../types/contracts/Tokens';
import { Nonce, Signers, Contracts } from './deploy.service';

import { join } from 'path';
import { readFileSync } from 'fs';

export async function deployTokens(useOldContracts: boolean) {
  let tokensFactory: Tokens__factory = <Tokens__factory>(
    await hre.ethers.getContractFactory('Tokens', Signers.CEO)
  );

  let uri: string | undefined = process.env.METADATA_JSON_URI;
  const CONTRACT_DEPLOYMENT_URI: string = uri ? uri : 'http://www.scienft.com/token-{id}.json';

  let envInitialMiningYield: string | undefined = process.env.INITIAL_MINING_YIELD_SCI;
  let initialMiningYield = BigNumber.from(envInitialMiningYield).mul(BigNumber.from(10).pow(18));

  let envMinimumMiningYield: string | undefined = process.env.MINIMUM_MINING_YIELD_SCI;
  let minimumMiningYield = BigNumber.from(envMinimumMiningYield).mul(BigNumber.from(10).pow(18));

  let envMiningFee: string | undefined = process.env.MINING_FEE_GAS;
  let miningFee = BigNumber.from(envMiningFee);

  let envDifficulty: string | undefined = process.env.DIFFICULTY;
  let difficulty = BigNumber.from(envDifficulty);

  let envMiningIntervalSeconds: string | undefined = process.env.MINING_INTERVAL_SECONDS;
  let miningIntervalSeconds = BigNumber.from(envMiningIntervalSeconds);

  let envMaxTotalSupply: string | undefined = process.env.MAXIMUM_TOTAL_SUPPLY_SCI;
  let maxTotalSupply = BigNumber.from(envMaxTotalSupply).mul(BigNumber.from(10).pow(18));

  let envMintingFee: string | undefined = process.env.MINTING_FEE_GAS;
  let mintingFee = BigNumber.from(envMintingFee);

  if (useOldContracts) {
    const config = hre.network.config;
    let chainId = config.chainId ? config.chainId : '31337';
    const content = readFileSync(
      join(__dirname, `../../deployment.config.${chainId}.json`),
      'utf-8'
    );
    let data = JSON.parse(content);
    console.log(`Using existing Tokens Contract @ ${data.tokensAddress}`);

    let tokens = <Tokens__contract>(
      new Contract(data.tokensAddress, tokensFactory.interface, Signers.CEO)
    );
    Contracts.tokens = tokens;
  } else {
    console.log(`Deploying Tokens Contract`);

    const gasBalanceCEO = await tokensFactory.signer.getBalance();

    const estimatedGas = await tokensFactory.signer.estimateGas(
      tokensFactory.getDeployTransaction(
        CONTRACT_DEPLOYMENT_URI,
        initialMiningYield,
        minimumMiningYield,
        miningFee,
        difficulty,
        miningIntervalSeconds,
        maxTotalSupply,
        mintingFee
      )
    );

    let blockLimit = (await hre.ethers.provider.getBlock('latest')).gasLimit;
    if (estimatedGas.gt(blockLimit)) {
      console.warn('Contract may be too big to fit in a block!', estimatedGas, blockLimit);
    } else {
      let feeData = await hre.ethers.provider.getFeeData();
      console.log(
        `Deploying wallet has ${gasBalanceCEO} gas. Estimate to deploy Tokens is ~${estimatedGas.mul(
          feeData.gasPrice || 1
        )}`
      );
    }

    let balanceBefore = await Signers.CEO.getBalance();
    let tokens = await tokensFactory.deploy(
      CONTRACT_DEPLOYMENT_URI,
      initialMiningYield,
      minimumMiningYield,
      miningFee,
      difficulty,
      miningIntervalSeconds,
      maxTotalSupply,
      mintingFee,
      await Nonce.CEO()
    );
    await tokens.deployed();
    let balanceAfter = await Signers.CEO.getBalance();
    let actualGasUsed = balanceBefore.sub(balanceAfter);
    console.log(`Deploying Tokens cost ${actualGasUsed}. CEO balance is now ${balanceAfter}`);

    Contracts.tokens = tokens;
  }
  console.log(`>>> Tokens Address = ${Contracts.tokens.address}`);

  // grant roles
  console.log(`${Signers.CEO.address} has TOKENS:CEO_ROLE as deployer`);
  const contracts: Tokens__contract[] = [Contracts.tokens, Contracts.tokens];
  const roles: string[] = [
    await Contracts.tokens.CFO_ROLE(),
    await Contracts.tokens.SUPERADMIN_ROLE(),
  ];
  const addresses: string[] = [Signers.CFO.address, Signers.SUPERADMIN.address];
  const roleNames: string[] = ['TOKENS:CFO_ROLE', 'TOKENS:SUPERADMIN_ROLE'];
  for (const [i, a] of addresses.entries()) {
    let hasRole = await contracts[i].hasRole(roles[i], a);
    if (!hasRole) {
      try {
        await contracts[i].grantRole(roles[i], a, await Nonce.CEO());
        console.log(`granted ${roleNames[i]} to ${addresses[i]}`);
      } catch (err) {
        console.error(`failed to grant ${roleNames[i]} to ${addresses[i]}`);
        console.error(err);
      }
    } else {
      console.log(`${addresses[i]} already has ${roleNames[i]}`);
    }
  }

  return Contracts.tokens.address;
}

if (require.main === module) {
  deployTokens(false).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

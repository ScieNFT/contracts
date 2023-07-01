import hre from 'hardhat';

import process from 'process';

import { BigNumber, Contract } from 'ethers';
import { Offers__factory } from '../../types/factories/contracts/Offers__factory';

import type { Tokens as Tokens__contract } from '../../types/contracts/Tokens';
import type { Offers as Offers__contract } from '../../types/contracts/Offers';

import { Nonce, Signers, Contracts } from './deploy.service';

import { join } from 'path';
import { readFileSync } from 'fs';

export async function deployOffers(
  useOldContracts: boolean,
  tokensAddress: string,
  skipSetup: boolean
) {
  if (!tokensAddress) {
    throw new Error('deployOffers must be provided with the Tokens address');
  }

  let offersFactory: Offers__factory = <Offers__factory>(
    await hre.ethers.getContractFactory('Offers', Signers.CEO)
  );

  let envListingFee: string | undefined = process.env.DEFAULT_LISTING_FEE_GAS;
  const listingFee = BigNumber.from(envListingFee);

  let envRoyaltyNumerator: string | undefined = process.env.DEFAULT_ROYALTY_NUMERATOR;
  const royaltyNumerator = BigNumber.from(envRoyaltyNumerator);

  if (useOldContracts) {
    const config = hre.network.config;
    let chainId = config.chainId ? config.chainId : '31337';
    const content = readFileSync(
      join(__dirname, `../../deployment.config.${chainId}.json`),
      'utf-8'
    );
    let data = JSON.parse(content);
    console.log(`Using existing Offers Contract @ ${data.offersAddress}`);
    let offers = <Offers__contract>(
      new Contract(data.offersAddress, offersFactory.interface, Signers.CEO)
    );
    Contracts.offers = offers;
  } else {
    console.log(`Deploying Offers with Tokens at ${tokensAddress}`);

    const gasBalanceCEO = await offersFactory.signer.getBalance();

    const estimatedGas = await offersFactory.signer.estimateGas(
      offersFactory.getDeployTransaction(tokensAddress, listingFee, royaltyNumerator)
    );

    let blockLimit = (await hre.ethers.provider.getBlock('latest')).gasLimit;
    if (estimatedGas > blockLimit) {
      console.warn('Contract might be too big to fit in a block!', estimatedGas, blockLimit);
    } else {
      let feeData = await hre.ethers.provider.getFeeData();
      console.log(
        `Deploying wallet has ${gasBalanceCEO} gas. Estimate to deploy Offers is ~${estimatedGas.mul(
          feeData.gasPrice || 1
        )}`
      );
    }

    let balanceBefore = await Signers.CEO.getBalance();
    let offers = await offersFactory.deploy(
      tokensAddress,
      listingFee,
      royaltyNumerator,
      await Nonce.CEO()
    );
    await offers.deployed();
    let balanceAfter = await Signers.CEO.getBalance();
    let actualGasUsed = balanceBefore.sub(balanceAfter);
    console.log(`Deploying Offers cost ${actualGasUsed}. CEO balance is now ${balanceAfter}`);

    Contracts.offers = offers;
  }
  console.log(`>>> Offers Address = ${Contracts.offers.address}`);

  if (skipSetup) {
    console.log('Skipping setup in Offers...');
  } else {
    // grant roles
    console.log(`${Signers.CEO.address} has OFFERS:CEO_ROLE as deployer`);
    const contracts: (Tokens__contract | Offers__contract)[] = [
      Contracts.tokens,
      Contracts.offers,
      Contracts.offers,
    ];
    const roles: string[] = [
      await Contracts.tokens.MARKETPLACE_ROLE(),
      await Contracts.offers.CFO_ROLE(),
      await Contracts.offers.SUPERADMIN_ROLE(),
    ];
    const addresses: string[] = [
      Contracts.offers.address,
      Signers.CFO.address,
      Signers.SUPERADMIN.address,
    ];
    const roleNames: string[] = [
      'TOKENS:MARKETPLACE_ROLE',
      'OFFERS:CFO_ROLE',
      'OFFERS:SUPERADMIN_ROLE',
    ];
    for (const [i, a] of addresses.entries()) {
      let hasRole = await contracts[i].hasRole(roles[i], a);
      if (!hasRole) {
        try {
          await contracts[i].grantRole(roles[i], a, {
            nonce: (await Nonce.CEO()).nonce,
            gasLimit: 100000,
          });
          console.log(`granted ${roleNames[i]} to ${addresses[i]}`);
        } catch (err) {
          console.error(`failed to grant ${roleNames[i]} to ${addresses[i]}`);
          console.error(err);
        }
      } else {
        console.log(`${addresses[i]} already has ${roleNames[i]}`);
      }
    }
  }
  return Contracts.offers.address;
}

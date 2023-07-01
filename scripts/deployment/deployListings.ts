import hre from 'hardhat';

import process from 'process';

import { BigNumber, Contract } from 'ethers';
import { Listings__factory } from '../../types/factories/contracts/Listings__factory';

import type { Tokens as Tokens__contract } from '../../types/contracts/Tokens';
import type { Listings as Listings__contract } from '../../types/contracts/Listings';

import { Nonce, Signers, Contracts } from './deploy.service';

import { join } from 'path';
import { readFileSync } from 'fs';

export async function deployListings(
  useOldContracts: boolean,
  tokensAddress: string,
  skipSetup: boolean
) {
  if (!tokensAddress) {
    throw new Error('deployListings must be provided with the Tokens address');
  }

  let listingsFactory: Listings__factory = <Listings__factory>(
    await hre.ethers.getContractFactory('Listings', Signers.CEO)
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
    console.log(`Using existing Listings Contract @ ${data.listingsAddress}`);
    let listings = <Listings__contract>(
      new Contract(data.listingsAddress, listingsFactory.interface, Signers.CEO)
    );
    Contracts.listings = listings;
  } else {
    console.log(`Deploying Listings with Tokens at ${tokensAddress}`);

    const gasBalanceCEO = await listingsFactory.signer.getBalance();

    const estimatedGas = await listingsFactory.signer.estimateGas(
      listingsFactory.getDeployTransaction(tokensAddress, listingFee, royaltyNumerator)
    );

    let blockLimit = (await hre.ethers.provider.getBlock('latest')).gasLimit;
    if (estimatedGas > blockLimit) {
      console.warn('Contract may be too big to fit in a block!', estimatedGas, blockLimit);
    } else {
      let feeData = await hre.ethers.provider.getFeeData();
      console.log(
        `Deploying wallet has ${gasBalanceCEO} gas. Estimate to deploy Listings is ~${estimatedGas.mul(
          feeData.gasPrice || 1
        )}`
      );
    }

    let balanceBefore = await Signers.CEO.getBalance();
    let listings = await listingsFactory.deploy(
      tokensAddress,
      listingFee,
      royaltyNumerator,
      await Nonce.CEO()
    );
    await listings.deployed();
    let balanceAfter = await Signers.CEO.getBalance();
    let actualGasUsed = balanceBefore.sub(balanceAfter);
    console.log(`Deploying Listings cost ${actualGasUsed}. CEO balance is now ${balanceAfter}`);

    Contracts.listings = listings;
  }
  console.log(`>>> Listings Address = ${Contracts.listings.address}`);

  if (skipSetup) {
    console.log('Skipping setup in Listings...');
  } else {
    // grant roles
    console.log(`${Signers.CEO.address} has LISTINGS:CEO_ROLE as deployer`);
    const contracts: (Tokens__contract | Listings__contract)[] = [
      Contracts.tokens,
      Contracts.listings,
      Contracts.listings,
    ];
    const roles: string[] = [
      await Contracts.tokens.MARKETPLACE_ROLE(),
      await Contracts.listings.CFO_ROLE(),
      await Contracts.listings.SUPERADMIN_ROLE(),
    ];
    const addresses: string[] = [
      Contracts.listings.address,
      Signers.CFO.address,
      Signers.SUPERADMIN.address,
    ];
    const roleNames: string[] = [
      'TOKENS:MARKETPLACE_ROLE',
      'LISTINGS:CFO_ROLE',
      'LISTINGS:SUPERADMIN_ROLE',
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
  return Contracts.listings.address;
}

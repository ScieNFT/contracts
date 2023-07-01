// https://github.com/NomicFoundation/hardhat/issues/2175
// `ts-node ...` doesn't work -- instead use `npx hardhat run`

import { deployTokens } from './deployTokens';
import { deployOffers } from './deployOffers';
import { deployListings } from './deployListings';
import { mineSCI } from '../../tools/mineSCI';

import { join } from 'path';
import { writeFileSync } from 'fs';

import hre from 'hardhat';
import { BigNumber, Wallet, providers, BigNumberish } from 'ethers';

import { Nonce, Contracts, Signers } from './deploy.service';

import { recoverColdWallet } from '../../tools/secretShares';

function scaleSCI(attoSCI: BigNumberish) {
  let scale = BigNumber.from(10).pow(18);
  return BigNumber.from(attoSCI).div(scale);
}

export async function deployAll(reuseOldContracts: boolean, skipSetup: boolean) {
  let provider = (hre as any).ethers.provider;
  const config = hre.network.config;
  let url = '';
  if ('url' in config) {
    url = config.url;
    provider = new providers.JsonRpcProvider(url, config.chainId);
  } else {
    console.error('Config does not contain the expected provider URL', config);
  }
  let chainId = config.chainId ? config.chainId : '31337';

  let useOldContracts = config.chainId ? reuseOldContracts : false;
  if (useOldContracts) {
    console.log('Using already deployed contracts.');
  } else {
    console.log('Deploying new contracts.');
  }

  // build the cold wallet secret
  let m = recoverColdWallet();
  Signers.CEO = Wallet.fromMnemonic(m, `m/44'/60'/0'/0/0`).connect(provider);
  Signers.CFO = Wallet.fromMnemonic(m, `m/44'/60'/0'/0/1`).connect(provider);

  m = process.env.SUPERADMIN_MNEMONIC || '';
  if (!m) {
    console.error('Could not find process.env.SUPERADMIN_MNEMONIC');
    throw new Error('Please set SUPERADMIN_MNEMONIC in the .env file');
  }
  Signers.SUPERADMIN = Wallet.fromMnemonic(m, `m/44'/60'/0'/0/0`).connect(provider);

  if (skipSetup) {
    console.log('Skipping setup...');
  } else {
    // for gas harvesting @ https://faucet.avax.network/
    for (let i: number = 2; i <= 10; i++) {
      let child = Wallet.fromMnemonic(m, `m/44'/60'/0'/0/${i}`).connect(provider);
      console.log(`Checking DEPLOYING_MNEMONIC child balance ${i} @ ${child.address}`);
      let addressGas;
      try {
        addressGas = await child.getBalance();
      } catch (error) {
        if (error.event === 'noNetwork' && error.code === 'NETWORK_ERROR') {
          console.log('No network connection!');
          process.exit(1); // 1 indicates an error. 0 would be a successful exit.
        } else {
          console.error(error);
        }
      }

      console.log(`DEPLOYING_MNEMONIC child ${i} @ ${child.address} has ${addressGas} gas`);
      if (addressGas?.gt(0)) {
        console.log(`harvesting gas from ${i} @ ${child.address}`);
        let originalGasPrice = await child.provider.getGasPrice();
        let gasPrice = originalGasPrice.mul(102).div(100);
        console.log(`using a gasPrice of ${gasPrice.div(1000000000)} nGAS`);
        let txFee = BigNumber.from(21000);
        let gasToReturn = addressGas.sub(txFee.mul(gasPrice));
        if (gasToReturn.gt(0)) {
          console.log(`returning ${gasToReturn} gas`);
          let tx = await child.sendTransaction({
            to: Signers.CEO.address,
            value: gasToReturn,
            gasPrice: gasPrice,
            gasLimit: txFee,
          });
          await tx.wait();
        } else {
          console.log(`balance is too low to recover gas`);
        }
      }
    }
    const gasBalanceCEO = await Signers.CEO.getBalance();
    const gasBalanceCFO = await Signers.CFO.getBalance();
    const gasBalanceSUPERADMIN = await Signers.SUPERADMIN.getBalance();

    // send some gas to the CFO and to the SUPERADMIN so we can withdraw mining fees if required
    let gasAmount = gasBalanceCEO.div(20);

    let tx = await Signers.CEO.sendTransaction({
      to: Signers.CFO.address,
      value: gasAmount,
      nonce: (await Nonce.CEO()).nonce,
      gasLimit: 100000,
    });

    await tx.wait();
    console.log(`transferred ${gasAmount} to CFO @ ${Signers.CFO.address}`);
    tx = await Signers.CEO.sendTransaction({
      to: Signers.SUPERADMIN.address,
      value: gasAmount,
      nonce: (await Nonce.CEO()).nonce,
      gasLimit: 100000,
    });
    await tx.wait();
    console.log(`transferred ${gasAmount} to SUPERADMIN @ ${Signers.SUPERADMIN.address}`);

    console.log(`**        CEO @ ${Signers.CEO.address} has ${gasBalanceCEO} gas`);
    console.log(`**        CFO @ ${Signers.CFO.address} has ${gasBalanceCFO} gas`);
    console.log(`** SUPERADMIN @ ${Signers.SUPERADMIN.address} has ${gasBalanceSUPERADMIN} gas`);
  }
  // deploy tokens
  await deployTokens(useOldContracts, skipSetup);

  if (!skipSetup) {
    let miningOperations = chainId === '31337' ? 8 : 64;

    // start mining asynchronously
    mineSCI(Contracts.tokens.address, miningOperations)
      .catch((error) => {
        if (error.event === 'noNetwork' && error.code === 'NETWORK_ERROR') {
          console.log('No network connection!');
          process.exit(1); // 1 indicates an error. 0 would be a successful exit.
        } else {
          console.error(error);
        }
      })
      .finally(() => console.log('mining complete'));
  }

  await deployOffers(useOldContracts, Contracts.tokens.address, skipSetup);

  await deployListings(useOldContracts, Contracts.tokens.address, skipSetup);

  if (!skipSetup) {
    let data = JSON.stringify({
      tokensAddress: Contracts.tokens.address,
      offersAddress: Contracts.offers.address,
      listingsAddress: Contracts.listings.address,
      chainId: config.chainId,
      url: url,
    });

    writeFileSync(join(__dirname, `../../deployment.config.${chainId}.json`), data, {
      flag: 'w',
    });

    console.log('wait 10 sec for mining...');

    // wait 10 seconds for mining and then fund the SUPERADMIN
    await new Promise((r) => setTimeout(r, 10000));

    console.log('transfering SCI to SUPERADMIN...');

    // transfer mined SCI to the SUPERADMIN
    let balanceBefore = await Contracts.tokens['balanceOf(address)'](Signers.CFO.address);
    console.log(`CFO @ ${Signers.CFO.address} has ${scaleSCI(balanceBefore)} SCI`);
    await Contracts.tokens
      .connect(Signers.CFO)
      .transfer(
        Signers.SUPERADMIN.address,
        BigNumber.from(100000).mul(BigNumber.from(10).pow(18)),
        {
          nonce: (await Nonce.CFO()).nonce,
          gasLimit: 100000,
        }
      );
    let balanceSUPERADMIN = await Contracts.tokens['balanceOf(address)'](
      Signers.SUPERADMIN.address
    );
    console.log(
      `SUPERADMIN @ ${Signers.SUPERADMIN.address} has ${scaleSCI(balanceSUPERADMIN).toString()} SCI`
    );
  }
  console.log(`finished with deployment`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  let reuseOldContracts = true;
  let skipSetup = false;
  deployAll(reuseOldContracts, skipSetup);
}

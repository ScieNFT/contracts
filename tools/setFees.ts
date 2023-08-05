// use `npx hardhat run ...`

import hre from 'hardhat';
import { BigNumber } from 'ethers';
import { deployAll } from '../scripts/deployment/deployAll';

const chainId = `${hre.network.config.chainId}` || '31337';
const snowtrace =
  chainId == '43113'
    ? 'https://testnet.snowtrace.io/tx/'
    : '43114'
    ? 'https://snowtrace.io/tx/'
    : '';

import { Nonce, Signers, Contracts } from '../scripts/deployment/deploy.service';

let oneGas = BigNumber.from(10).pow(18);

let miningFeeGas = oneGas.mul(2);
let mintingFeeGas = oneGas.mul(2);
let marketplaceFeeGas = oneGas.mul(2);

async function setMiningFee(newFeeGas: BigNumber) {
  let oldFeeGas = await Contracts.tokens.miningFee();
  if (!oldFeeGas.eq(newFeeGas)) {
    console.log(`changing mining fee from ${oldFeeGas} to ${newFeeGas} gas`);
    let tx = await Contracts.tokens.connect(Signers.CFO).setMiningFee(newFeeGas, {
      nonce: (await Nonce.CFO()).nonce,
      gasLimit: 100000,
    });
    console.log(`tokens.setMiningFee ${snowtrace}${tx.hash}`);
    await tx.wait();
  }
}

async function setMintingFee(newFeeGas: BigNumber) {
  let oldFeeGas = await Contracts.tokens.mintingFee();
  if (!oldFeeGas.eq(newFeeGas)) {
    console.log(`changing minting fee from ${oldFeeGas} to ${newFeeGas} gas`);
    let tx = await Contracts.tokens.connect(Signers.CFO).setMintingFee(newFeeGas, {
      nonce: (await Nonce.CFO()).nonce,
      gasLimit: 100000,
    });
    console.log(`tokens.setMintingFee ${snowtrace}${tx.hash}`);
    await tx.wait();
  }
}

async function setOfferFee(newFeeGas: BigNumber) {
  let oldFeeGas = await Contracts.offers.offerFee();
  if (!oldFeeGas.eq(newFeeGas)) {
    console.log(`changing offer fee from ${oldFeeGas} to ${newFeeGas} gas`);
    let tx = await Contracts.offers.connect(Signers.CFO).setOfferFee(newFeeGas, {
      nonce: (await Nonce.CFO()).nonce,
      gasLimit: 100000,
    });
    console.log(`offers.setOfferFee ${snowtrace}${tx.hash}`);
    await tx.wait();
  }
}

async function setListingFee(newFeeGas: BigNumber) {
  let oldFeeGas = await Contracts.listings.listingFee();
  if (!oldFeeGas.eq(newFeeGas)) {
    console.log(`changing listings fee from ${oldFeeGas} to ${newFeeGas} gas`);
    let tx = await Contracts.listings.connect(Signers.CFO).setListingFee(newFeeGas, {
      nonce: (await Nonce.CFO()).nonce,
      gasLimit: 100000,
    });
    console.log(`listings.setListingFee ${snowtrace}${tx.hash}`);
    await tx.wait();
  }
}

async function main() {
  let reuseOldContracts = true;
  let skipSetup = true;
  await deployAll(reuseOldContracts, skipSetup);

  await setListingFee(marketplaceFeeGas);
  await setOfferFee(marketplaceFeeGas);
  await setMiningFee(miningFeeGas);
  await setMintingFee(mintingFeeGas);
}

if (require.main === module) {
  main();
}

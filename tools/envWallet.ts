import { Mnemonic } from '@avalabs/avalanchejs';
import { ethers } from 'ethers';
import { join } from 'path';

import * as dotenv from 'dotenv';
dotenv.config({ path: join(__dirname, '../.env') });

/*
 *
 *  SHOW DATA FOR ENV MNEMONIC
 *
 */

// Ensure that we have all the environment variables we need.
const m: string | undefined = process.env.DEPLOYING_MNEMONIC;
console.log(m);
console.log(process.env.METADATA_JSON_URI);

if (!m) {
  throw new Error('Please set your DEPLOYING_MNEMONIC in a .env file');
}

const mnemonic: Mnemonic = Mnemonic.getInstance();
let k = mnemonic.mnemonicToEntropy(m);
console.log(`\n`);
console.log(`\n`);
console.log(`--- PRIVATE KEY:`);
console.log(k);
console.log(`\n`);
console.log(`--- MNEMONIC WORDS:`);
console.log(m);
console.log(`\n`);
console.log(`--- FIRST 10 ADDRESSES:`);
// When we use this key in ethers, these will be the first 10 signer addresses
for (let i: number = 0; i <= 10; i++) {
  let child = ethers.Wallet.fromMnemonic(m, `m/44'/60'/0'/0/${i}`);
  console.log(i, child.getAddress());
}
console.log(`\n`);
console.log(`\n`);

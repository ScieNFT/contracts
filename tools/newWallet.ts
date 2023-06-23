import { randomBytes } from 'crypto';
import { Mnemonic } from 'avalanche';
import { ethers } from 'ethers';

/*
 *
 *  GENERATE A NEW PRIVATE KEY
 *
 */

const mnemonic: Mnemonic = Mnemonic.getInstance();
const strength: number = 256;
const wordlist = mnemonic.getWordlists('english') as string[];
//@ts-ignore
let m = mnemonic.generateMnemonic(strength, randomBytes, wordlist);
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

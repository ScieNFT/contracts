import { randomBytes } from 'crypto';
import { Mnemonic } from '@avalabs/avalanchejs';
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
console.log(`--- NEW WALLET PRIVATE KEY:`);
console.log(k);
console.log(`\n`);
console.log(`--- NEW WALLET MNEMONIC WORDS:`);
console.log(mnemonic.entropyToMnemonic(k, wordlist));
if (m != mnemonic.entropyToMnemonic(k, wordlist)) {
  throw 'mnemonic does not match!';
}
console.log(`\n`);
console.log(`--- FIRST 10 DERIVED ADDRESSES:`);
// When we use this key in ethers, these will be the first 10 signer addresses
for (let i: number = 0; i <= 10; i++) {
  let child = ethers.Wallet.fromMnemonic(m, `m/44'/60'/0'/0/${i}`);
  console.log(i, child.getAddress());
}
console.log(`\n`);

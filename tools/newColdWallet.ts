import { randomBytes } from 'crypto';
import { Mnemonic } from '@avalabs/avalanchejs';
import { ethers, BigNumber } from 'ethers';
import { makeRandomShares, testRecovery, shareToMnemonic } from './secretShares';

/*
 *
 *  GENERATE NEW COLD WALLET SHARES
 *
 */

const mnemonic: Mnemonic = Mnemonic.getInstance();
const strength: number = 256;
const wordlist = mnemonic.getWordlists('english') as string[];
//@ts-ignore
let m = mnemonic.generateMnemonic(strength, randomBytes, wordlist);
let k = mnemonic.mnemonicToEntropy(m);
if (m != mnemonic.entropyToMnemonic(k, wordlist)) {
  throw 'mnemonic does not match!';
}

// new cold wallet secret
const secret = BigNumber.from(`0x${k}`);
const shares = makeRandomShares(secret, 3, 6);
const envNames = [
  'DEPLOYING_SHARE_1',
  'DEPLOYING_SHARE_2',
  'DEPLOYING_SHARE_3',
  'DEPLOYING_SHARE_4',
  'DEPLOYING_SHARE_5',
  'DEPLOYING_SHARE_6',
];

console.log(`\n`);
console.log(`--- NEW COLD WALLET SHARES:`);
if (shares) {
  for (const [i, share] of shares.entries()) {
    console.log(`${envNames[i]}="${shareToMnemonic(share[1])}"`);
  }
}
console.log(`\n`);
console.log('Secret recovered from random subset: ', testRecovery(secret, shares));
console.log(`\n`);
console.log(`--- FIRST 10 DERIVED ADDRESSES:`);
// When we use this key in ethers, these will be the first 10 signer addresses
for (let i: number = 0; i <= 10; i++) {
  let child = ethers.Wallet.fromMnemonic(m, `m/44'/60'/0'/0/${i}`);
  console.log(i, child.getAddress());
}
console.log(`\n`);

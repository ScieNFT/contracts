import { BigNumber, ethers } from 'ethers';
import { recoverColdWallet, shareToMnemonic, makeRandomShares, testRecovery } from './secretShares';
import { Mnemonic } from '@avalabs/avalanchejs';

/*
 *
 *  RECOVER MNEMONIC FROM COLD WALLET SHARES
 *
 */

// recover cold wallet mnemonic from env variables
let m = recoverColdWallet();

const envNames = [
  'DEPLOYING_SHARE_1',
  'DEPLOYING_SHARE_2',
  'DEPLOYING_SHARE_3',
  'DEPLOYING_SHARE_4',
  'DEPLOYING_SHARE_5',
  'DEPLOYING_SHARE_6',
];

const mnemonic: Mnemonic = Mnemonic.getInstance();
const wordlist = mnemonic.getWordlists('english') as string[];
let k = mnemonic.mnemonicToEntropy(m, wordlist);
if (m != mnemonic.entropyToMnemonic(k, wordlist)) {
  throw 'mnemonic does not match!';
}
const secret = BigNumber.from(`0x${k}`);
const shares = makeRandomShares(secret, 3, 6);

console.log(`\n`);
console.log(`--- NEW COLD WALLET SHARES FOR SECRET:`);
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

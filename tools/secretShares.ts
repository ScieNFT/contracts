import { randomBytes } from 'crypto';
import { Mnemonic } from '@avalabs/avalanchejs';
import { ethers, BigNumber } from 'ethers';

// Our implementation of Shamir's Secret Sharing is based on the python
// code available on the wikipedia page
// https://en.wikipedia.org/wiki/Shamir%27s_secret_sharing#Python_code

const PRIME = BigNumber.from(2).pow(256).add(297);

function random32Bytes() {
  // this will always be less than PRIME.sub(1) so no need to return modulo (PRIME.sub(1))
  return ethers.BigNumber.from(ethers.utils.randomBytes(32));
}

function evalAt(poly: BigNumber[], x: BigNumber, prime: BigNumber): BigNumber {
  let accum: BigNumber = BigNumber.from(0);
  for (let i = poly.length - 1; i >= 0; i--) {
    accum = accum.mul(x);
    accum = accum.add(poly[i]);
    accum = accum.mod(prime);
  }
  return accum;
}

export function makeRandomShares(
  secret: BigNumber,
  minimum: number,
  shares: number,
  prime = PRIME
): [BigNumber, BigNumber][] {
  if (minimum > shares) {
    throw new Error('Pool secret would be irrecoverable.');
  }
  const poly: BigNumber[] = [secret];
  for (let i = 0; i < minimum - 1; i++) {
    poly.push(random32Bytes());
  }
  const points: [BigNumber, BigNumber][] = [];
  for (let i = 1; i <= shares; i++) {
    points.push([BigNumber.from(i), evalAt(poly, BigNumber.from(i), prime)]);
  }
  return points;
}

function extendedGCD(a: BigNumber, b: BigNumber): [BigNumber, BigNumber] {
  let x: BigNumber = BigNumber.from(0);
  let lastX: BigNumber = BigNumber.from(1);
  let y: BigNumber = BigNumber.from(1);
  let lastY: BigNumber = BigNumber.from(0);

  while (!b.isZero()) {
    const quot: BigNumber = a.div(b);
    [a, b] = [b, a.mod(b)];
    [x, lastX] = [lastX.sub(quot.mul(x)), x];
    [y, lastY] = [lastY.sub(quot.mul(y)), y];
  }
  return [lastX, lastY];
}

function divmod(num: BigNumber, den: BigNumber, p: BigNumber): BigNumber {
  const [inv, _] = extendedGCD(den, p);
  return num.mul(inv).mod(p);
}

function lagrangeInterpolate(
  x: BigNumber,
  xs: BigNumber[],
  ys: BigNumber[],
  p: BigNumber
): BigNumber {
  const k = xs.length;

  if (k !== new Set(xs).size) {
    throw new Error('points must be distinct');
  }

  const PI = (vals: BigNumber[]): BigNumber => {
    return vals.reduce((accum: BigNumber, v: BigNumber) => accum.mul(v), BigNumber.from(1));
  };

  let nums: BigNumber[] = []; // avoid inexact division
  let dens: BigNumber[] = [];
  for (let i = 0; i < k; i++) {
    let others: BigNumber[] = Array.from(xs);
    let cur: BigNumber = others.splice(i, 1)[0];
    nums.push(PI(others.map((o: BigNumber) => x.sub(o))));
    dens.push(PI(others.map((o: BigNumber) => cur.sub(o))));
  }

  const den: BigNumber = PI(dens);
  let num: BigNumber = ethers.BigNumber.from(0);
  for (let i = 0; i < k; i++) {
    num = num.add(divmod(nums[i].mul(den).mul(ys[i]).mod(p), dens[i], p));
  }

  return divmod(num, den, p).add(p).mod(p);
}

function recoverSecret(shares: [BigNumber, BigNumber][], prime = PRIME): BigNumber {
  if (shares.length < 3) {
    throw new Error('need at least three shares');
  }
  const xs: BigNumber[] = shares.map((share) => share[0]);
  const ys: BigNumber[] = shares.map((share) => share[1]);
  return lagrangeInterpolate(BigNumber.from(0), xs, ys, prime);
}

function randomSubsetIndices(length: number, subsetSize = 3): number[] {
  // Create an array of indices [0, 1, 2, ..., length - 1]
  const indices = Array.from({ length }, (_, i) => i);

  // Shuffle the array using Fisher-Yates (Knuth) algorithm.
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // Return the first 'subsetSize' elements
  return indices.slice(0, subsetSize);
}

const mnemonic: Mnemonic = Mnemonic.getInstance();
const wordlist = mnemonic.getWordlists('english') as string[];

export function shareToMnemonic(share: BigNumber) {
  let entropy = share.toHexString().slice(2).padStart(64, '0');
  let m = mnemonic.entropyToMnemonic(entropy, wordlist);
  let k = mnemonic.mnemonicToEntropy(m);
  let kBN = BigNumber.from(`0x${k}`);
  if (!kBN.eq(share)) {
    throw 'share not recovered!';
  }
  return m;
}

import { join } from 'path';

import * as dotenv from 'dotenv';
dotenv.config({ path: join(__dirname, '../.env') });

export function recoverColdWallet(): string {
  // load shares from env
  const envShareMnemonics: (string | undefined)[] = [
    process.env.DEPLOYING_SHARE_1,
    process.env.DEPLOYING_SHARE_2,
    process.env.DEPLOYING_SHARE_3,
    process.env.DEPLOYING_SHARE_4,
    process.env.DEPLOYING_SHARE_5,
    process.env.DEPLOYING_SHARE_6,
  ];

  const definedEnvShareMnemonics: string[] = envShareMnemonics.filter(
    (share): share is string => share !== undefined && share !== ''
  );
  if (definedEnvShareMnemonics.length < 3) {
    throw new Error('Please set at least three DEPLOYING_SHARE_* values in the .env file');
  }

  // note that we label the shares by i+1 here!
  const shares: [ethers.BigNumber, ethers.BigNumber][] = definedEnvShareMnemonics.map((m, i) => {
    return [BigNumber.from(i + 1), BigNumber.from(`0x${mnemonic.mnemonicToEntropy(m)}`)];
  });

  return shareToMnemonic(recoverSecret(shares));
}

export function testRecovery(
  secret: BigNumber,
  shares: [ethers.BigNumber, ethers.BigNumber][]
): boolean {
  const indices = randomSubsetIndices(shares.length, 3);
  const recoveredSecret = recoverSecret(indices.map((i) => shares[i]));
  return recoveredSecret.eq(secret);
}

async function main() {
  const strength: number = 256;
  //@ts-ignore
  let m = mnemonic.generateMnemonic(strength, randomBytes, wordlist);
  let k = mnemonic.mnemonicToEntropy(m);

  const secret = BigNumber.from(`0x${k}`);
  const shares = makeRandomShares(secret, 3, 6);

  console.log(`\n`);
  console.log('Secret: ', secret.toHexString());
  console.log('Shares:');
  if (shares) {
    for (const share of shares) {
      console.log(`${share[0]} => ${share[1].toHexString()}`);
    }
  }
  console.log('Secret recovered from shares: ', testRecovery(secret, shares));

  console.log(`\n`);
  console.log('Secret: ');
  console.log(shareToMnemonic(secret));
  console.log(`\n`);
  console.log('Shares:');
  if (shares) {
    for (const share of shares) {
      console.log(`${share[0]} => ${shareToMnemonic(share[1])}\n`);
    }
  }
  console.log('Secret recovered from shares: ', testRecovery(secret, shares));

  console.log(shareToMnemonic(recoverSecret(shares)));
}

// don't run main when importing this code as a module
if (!module.parent) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

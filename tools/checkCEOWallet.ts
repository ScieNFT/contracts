// use `npx hardhat run ...

import hre from 'hardhat';
import { Signers } from '../scripts/deployment/deploy.service';
import { recoverColdWallet } from '../tools/secretShares';
import { Wallet } from 'ethers';

async function main() {
  let provider = (hre as any).ethers.provider;
  let m = recoverColdWallet();
  Signers.CEO = Wallet.fromMnemonic(m, `m/44'/60'/0'/0/0`).connect(provider);
  const gasBalanceCEO = await Signers.CEO.getBalance();
  console.log('CEO AVAX', gasBalanceCEO);
}

if (require.main === module) {
  main();
}

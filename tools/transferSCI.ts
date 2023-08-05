// use `npx hardhat run ...`

import { BigNumber } from 'ethers';
import { deployAll } from '../scripts/deployment/deployAll';
import { printBalances, checkBalances } from './checkWallets';

import { Nonce, Signers, Contracts } from '../scripts/deployment/deploy.service';

async function main() {
  let reuseOldContracts = true;
  let skipSetup = true;
  await deployAll(reuseOldContracts, skipSetup);

  let recipientAddress = '0x2Ee906c6d571415CD18746d873aa7DaF5a4c637d';
  let amount = BigNumber.from(10).pow(18).mul(500);

  let tx = await Contracts.tokens.connect(Signers.SUPERADMIN).transfer(recipientAddress, amount, {
    nonce: (await Nonce.SUPERADMIN()).nonce,
    gasLimit: 200000,
  });
  await tx.wait();
}

if (require.main === module) {
  main();
}

// use `npx hardhat run ...`

import { deployAll } from '../scripts/deployment/deployAll';
import { Signers, Contracts, Nonce } from '../scripts/deployment/deploy.service';
import { BigNumber } from 'ethers';

import { printBalances, checkBalances, type Balance } from './checkWallets';

function f(x: BigNumber | string): string {
  if (x instanceof BigNumber) {
    return x.toString().padStart(30, ' ');
  } else {
    return x.padStart(12, ' ');
  }
}

async function main() {
  let reuseOldContracts = true;
  let skipSetup = true;
  await deployAll(reuseOldContracts, skipSetup);
  let balances = await checkBalances();
  printBalances('INITIAL BALANCES', balances);

  let contracts = {
    Tokens: Contracts.tokens,
    Listings: Contracts.listings,
    Offers: Contracts.offers,
  };

  let offersSciBalance = BigNumber.from(0);

  // collect from contracts
  for (const b of balances) {
    if (b.accountName === 'Tokens' || b.accountName === 'Listings' || b.accountName === 'Offers') {
      if (b.gas.gt(0)) {
        console.log(`move ${b.gas} gas from ${b.accountName} to SUPERADMIN`);
        let tx = await contracts[b.accountName]
          .connect(Signers.CFO)
          .withdraw(Signers.SUPERADMIN.address, b.gas, {
            nonce: (await Nonce.CFO()).nonce,
            gasLimit: 100000,
          });
        console.log(`${b.accountName.toLowerCase()}.withdraw tx hash is ${tx.hash}`);
        await tx.wait();
      }
      if (b.sci.gt(0)) {
        // Tokens and Listings should never be sent SCI, but we added recovery functions
        // if somebody makes a mistake. SCI are staked in Offers, so we should not
        // move SCI from there.
        if (b.accountName === 'Offers') {
          console.log(`ignoring ${b.sci} attoSCI staked in ${b.accountName}`);
          offersSciBalance = b.sci;
        } else if (b.accountName === 'Tokens') {
          console.log(`move ${b.sci} attoSCI from ${b.accountName} to SUPERADMIN`);
          // recover SCI accidentally sent to 'Tokens'
          let tx = await contracts[b.accountName]
            .connect(Signers.CFO)
            .withdrawSCI(Signers.SUPERADMIN.address, b.sci, {
              nonce: (await Nonce.CFO()).nonce,
              gasLimit: 100000,
            });
          console.log(`${b.accountName.toLowerCase()}.withdrawSCI tx hash is ${tx.hash}`);
          await tx.wait();
        } else if (b.accountName === 'Listings') {
          console.log(`move ${b.sci} attoSCI from ${b.accountName} to SUPERADMIN`);
          // recover SCI accidentally sent to 'Listings'
          let tx = await contracts[b.accountName]
            .connect(Signers.CFO)
            .withdrawTokens(Signers.SUPERADMIN.address, 0, b.sci, {
              nonce: (await Nonce.CFO()).nonce,
              gasLimit: 100000,
            });
          console.log(`${b.accountName.toLowerCase()}.withdrawSCI tx hash is ${tx.hash}`);
          await tx.wait();
        }
      }
    }
  }

  // recheck balances
  balances = await checkBalances();
  printBalances('AFTER CONTRACT COLLECTION', balances);

  // calculate the total sum of gas and SCI
  let totalGas = BigNumber.from(0);
  let totalSCI = BigNumber.from(0);
  for (const b of balances) {
    totalGas = totalGas.add(b.gas);
    totalSCI = totalSCI.add(b.sci);
  }
  // ignore any SCI staked in Offers
  totalSCI = totalSCI.sub(offersSciBalance);

  function getAmounts(role: string, balances: Balance[]): { gas: BigNumber; sci: BigNumber } {
    const balance = balances.find((b) => b.accountName === role);
    if (balance) {
      const { gas, sci } = balance;
      return { gas, sci };
    }
    throw new Error(`unexpected role ${role}`);
  }
  let { gas: ceoGas, sci: ceoSCI } = getAmounts('CEO', balances);
  let { gas: cfoGas, sci: cfoSCI } = getAmounts('CFO', balances);
  // let { gas: superadminGas, sci: superadminSCI } = getAmounts('SUPERADMIN', balances);

  // allocate 5% of gas to CEO and CFO, balance to SUPERADMIN
  let coldGas = totalGas.div(20);
  let hotGas = totalGas.sub(coldGas).sub(coldGas);
  console.log(`total available gas is        ${f(totalGas)}`);
  console.log(`desired CEO/CFO gas is        ${f(coldGas)}`);
  console.log(`desired SUPERADMIN gas is     ${f(hotGas)}`);
  console.log('\n');

  let originalGasPrice = await Signers.SUPERADMIN.provider.getGasPrice();
  let gasPrice = originalGasPrice.mul(102).div(100);
  let txFee = BigNumber.from(21000);

  if (ceoGas.lt(coldGas)) {
    let gas = coldGas.sub(ceoGas);
    console.log(`move ${gas} gas from SUPERADMIN to CEO`);
    let tx = await Signers.SUPERADMIN.sendTransaction({
      to: Signers.CEO.address,
      value: gas,
      gasPrice: gasPrice,
      gasLimit: txFee, // 21,000
      nonce: (await Nonce.SUPERADMIN()).nonce,
    });
    console.log(`transfer tx hash is ${tx.hash}`);
    await tx.wait();
  }
  if (ceoGas.gt(coldGas)) {
    let gas = ceoGas.sub(coldGas);
    console.log(`move ${gas} gas from CEO to SUPERADMIN`);
    let tx = await Signers.CEO.sendTransaction({
      to: Signers.SUPERADMIN.address,
      value: gas,
      gasPrice: gasPrice,
      gasLimit: txFee, // 21,000
      nonce: (await Nonce.CEO()).nonce,
    });
    console.log(`transfer tx hash is ${tx.hash}`);
    await tx.wait();
  }

  if (cfoGas.lt(coldGas)) {
    let gas = coldGas.sub(cfoGas);
    console.log(`move ${gas} gas from SUPERADMIN to CFO`);
    let tx = await Signers.SUPERADMIN.sendTransaction({
      to: Signers.CFO.address,
      value: gas,
      gasPrice: gasPrice,
      gasLimit: txFee, // 21,000
      nonce: (await Nonce.SUPERADMIN()).nonce,
    });
    console.log(`transfer tx hash is ${tx.hash}`);
    await tx.wait();
  }
  if (cfoGas.gt(coldGas)) {
    let gas = cfoGas.sub(coldGas);
    console.log(`move ${gas} gas from CFO to SUPERADMIN`);
    let tx = await Signers.CFO.sendTransaction({
      to: Signers.SUPERADMIN.address,
      value: gas,
      gasPrice: gasPrice,
      gasLimit: txFee, // 21,000
      nonce: (await Nonce.CFO()).nonce,
    });
    console.log(`transfer tx hash is ${tx.hash}`);
    await tx.wait();
  }

  // allocate 95% of SCI to CFO, balance to SUPERADMIN
  let hotSCI = totalSCI.div(20);
  let coldSCI = totalSCI.sub(hotSCI);
  console.log(`total available attoSCI is    ${f(totalSCI)}`);
  console.log(`desired CFO attoSCI is        ${f(coldSCI)}`);
  console.log(`desired SUPERADMIN attoSCI is ${f(hotSCI)}`);

  if (cfoSCI.lt(coldSCI)) {
    let sci = coldSCI.sub(cfoSCI);
    console.log(`move ${sci} SCI from SUPERADMIN to CFO`);
    let tx = await Contracts.tokens.connect(Signers.SUPERADMIN).transfer(Signers.CFO.address, sci, {
      nonce: (await Nonce.SUPERADMIN()).nonce,
      gasLimit: 100000,
    });
    console.log(`transfer tx hash is ${tx.hash}`);
    await tx.wait();
  }
  if (cfoSCI.gt(coldSCI)) {
    let sci = cfoSCI.sub(coldSCI);
    console.log(`move ${sci} SCI from CFO to SUPERADMIN`);
    let tx = await Contracts.tokens.connect(Signers.CFO).transfer(Signers.SUPERADMIN.address, sci, {
      nonce: (await Nonce.CFO()).nonce,
      gasLimit: 100000,
    });
    console.log(`transfer tx hash is ${tx.hash}`);
    await tx.wait();
  }

  // move all CEO SCI to CFO
  if (ceoSCI.gt(0)) {
    console.log(`move ${ceoSCI} SCI from CEO to CFO`);
    let tx = await Contracts.tokens.connect(Signers.CEO).transfer(Signers.CFO.address, ceoSCI, {
      nonce: (await Nonce.CEO()).nonce,
      gasLimit: 100000,
    });
    console.log(`transfer tx hash is ${tx.hash}`);
    await tx.wait();
  }

  balances = await checkBalances();
  printBalances('FINAL BALANCES', balances);
}

if (require.main === module) {
  main();
}

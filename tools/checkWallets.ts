// use `npx hardhat run ...`

import { deployAll } from '../scripts/deployment/deployAll';
import { Signers, Contracts } from '../scripts/deployment/deploy.service';
import hre from 'hardhat';
import { BigNumber } from 'ethers';

function scaleSCI(attoSCI: BigNumber) {
  let scale = BigNumber.from(10).pow(18);
  return BigNumber.from(attoSCI).div(scale);
}

export interface Balance {
  accountName: string;
  gas: BigNumber;
  sci: BigNumber;
  address: string;
}

export function printBalances(title: string, balances: Balance[]) {
  function f(x: BigNumber | string): string {
    if (x instanceof BigNumber) {
      return x.toString().padStart(30, ' ');
    } else {
      return x.padStart(12, ' ');
    }
  }

  console.log(`\n`);
  console.log(`--- ${title}`);
  for (const b of balances) {
    console.log(
      `${f(b.accountName)} ${f(b.gas)} gas   ${f(scaleSCI(b.sci))} SCI   @ ${f(b.address)}`
    );
  }
  console.log(`\n`);
}

export async function checkBalances(): Promise<Balance[]> {
  const gasBalanceCEO = await Signers.CEO.getBalance();
  const gasBalanceCFO = await Signers.CFO.getBalance();
  const gasBalanceSUPERADMIN = await Signers.SUPERADMIN.getBalance();

  let provider = (hre as any).ethers.provider;
  const gasBalanceTokens = await provider.getBalance(Contracts.tokens.address);
  const gasBalanceListings = await provider.getBalance(Contracts.listings.address);
  const gasBalanceOffers = await provider.getBalance(Contracts.offers.address);

  const sciBalanceCEO = await Contracts.tokens['balanceOf(address)'](Signers.CEO.address);
  const sciBalanceCFO = await Contracts.tokens['balanceOf(address)'](Signers.CFO.address);
  const sciBalanceSUPERADMIN = await Contracts.tokens['balanceOf(address)'](
    Signers.SUPERADMIN.address
  );
  const sciBalanceTokens = await Contracts.tokens['balanceOf(address)'](Contracts.tokens.address);
  const sciBalanceListings = await Contracts.tokens['balanceOf(address)'](
    Contracts.listings.address
  );
  const sciBalanceOffers = await Contracts.tokens['balanceOf(address)'](Contracts.offers.address);

  let balances: Balance[] = [
    { accountName: 'CEO', gas: gasBalanceCEO, sci: sciBalanceCEO, address: Signers.CEO.address },
    { accountName: 'CFO', gas: gasBalanceCFO, sci: sciBalanceCFO, address: Signers.CFO.address },
    {
      accountName: 'SUPERADMIN',
      gas: gasBalanceSUPERADMIN,
      sci: sciBalanceSUPERADMIN,
      address: Signers.SUPERADMIN.address,
    },
    {
      accountName: 'Tokens',
      gas: gasBalanceTokens,
      sci: sciBalanceTokens,
      address: Contracts.tokens.address,
    },
    {
      accountName: 'Listings',
      gas: gasBalanceListings,
      sci: sciBalanceListings,
      address: Contracts.listings.address,
    },
    {
      accountName: 'Offers',
      gas: gasBalanceOffers,
      sci: sciBalanceOffers,
      address: Contracts.offers.address,
    },
  ];
  return balances;
}

async function main() {
  let reuseOldContracts = true;
  let skipSetup = true;
  await deployAll(reuseOldContracts, skipSetup);
  let balances = await checkBalances();
  printBalances('BALANCES', balances);
}

if (require.main === module) {
  main();
}

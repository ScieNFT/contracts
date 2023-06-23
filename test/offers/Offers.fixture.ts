import { ethers } from 'hardhat';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import type { Offers } from '../../types/contracts/Offers';
import type { Offers__factory } from '../../types/factories/contracts/Offers__factory';
import type { Tokens } from '../../types/contracts/Tokens';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployTokensFixture } from '../tokens/Tokens.fixture';

export async function deployOffersFixture(): Promise<{
  CEO: SignerWithAddress;
  CFO: SignerWithAddress;
  SUPERADMIN: SignerWithAddress;
  OWNER: SignerWithAddress;
  BRIDGE: SignerWithAddress;
  ANYONE: SignerWithAddress;
  EVERYONE: SignerWithAddress[];
  tokens: Tokens;
  offers: Offers;
}> {
  const w = 25;

  // deploy and setup Tokens contract
  const { CEO, CFO, SUPERADMIN, OWNER, BRIDGE, ANYONE, EVERYONE, OFFERS_CONTRACT, tokens } =
    await loadFixture(deployTokensFixture);

  let envListingFee: string | undefined = process.env.DEFAULT_LISTING_FEE_GAS;
  const listingFee: number = envListingFee ? parseInt(envListingFee) : 0;

  let envRoyaltyNumerator: string | undefined = process.env.DEFAULT_ROYALTY_NUMERATOR;
  const royaltyNumerator: number = envRoyaltyNumerator ? parseInt(envRoyaltyNumerator) : 0;

  // check gas cost for deployment
  //@ts-ignore
  let OffersFactory: Offers__factory = <Offers__factory>(
    await ethers.getContractFactory('Offers', CEO)
  );

  const estimatedGas = await OffersFactory.signer.estimateGas(
    OffersFactory.getDeployTransaction(tokens.address, listingFee, royaltyNumerator)
  );
  console.log('Deployment gas needed:'.padEnd(w), estimatedGas.toString());

  const deployerBalance = await OffersFactory.signer.getBalance();
  console.log('Deployer gas (CEO):'.padEnd(w), deployerBalance.toString());

  if (deployerBalance.lt(estimatedGas)) {
    throw new Error(
      `Insufficient funds. Top up your account balance by ${ethers.utils.formatEther(
        estimatedGas.sub(deployerBalance)
      )}`
    );
  }

  // deploy Offers contract as the CEO
  let offers: Offers = {} as Offers;
  try {
    offers = await OffersFactory.deploy(tokens.address, listingFee, royaltyNumerator);
    await offers.deployed();
    console.log('Deployed Offers to:'.padEnd(w), offers.address);
  } catch (err) {
    console.log('***** DEPLOYING FAILED!'.padEnd(w), err);
  }

  // update tokens contract roles
  let tokensContractAsCEO = new ethers.Contract(tokens.address, tokens.interface, CEO);
  await tokensContractAsCEO.revokeRole(await tokens.MARKETPLACE_ROLE(), OFFERS_CONTRACT.address);
  await tokensContractAsCEO.grantRole(await tokens.MARKETPLACE_ROLE(), offers.address);
  await tokensContractAsCEO.grantRole(await tokens.BRIDGE_ROLE(), BRIDGE.address);

  // set Offers contract roles
  let OffersContractAsCEO = new ethers.Contract(offers.address, offers.interface, CEO);
  await OffersContractAsCEO.grantRole(await offers.CFO_ROLE(), CFO.address);
  await OffersContractAsCEO.grantRole(await offers.SUPERADMIN_ROLE(), SUPERADMIN.address);

  return {
    CEO,
    CFO,
    SUPERADMIN,
    OWNER,
    BRIDGE,
    ANYONE,
    EVERYONE,
    tokens,
    offers,
  };
}

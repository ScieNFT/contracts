import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import type { Tokens } from "../../types/contracts/Tokens";
import type { Listings } from "../../types/contracts/Listings";
import type { Listings__factory } from "../../types/factories/contracts/Listings__factory";

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployTokensFixture } from "../tokens/Tokens.fixture";

export async function deployListingsFixture(): Promise<{
  CEO: SignerWithAddress;
  CFO: SignerWithAddress;
  SUPERADMIN: SignerWithAddress;
  OWNER: SignerWithAddress;
  BRIDGE: SignerWithAddress;
  ANYONE: SignerWithAddress;
  EVERYONE: SignerWithAddress[];
  tokens: Tokens;
  listings: Listings;
}> {
  const w = 25;

  // deploy and setup Tokens contract
  const {
    CEO,
    CFO,
    SUPERADMIN,
    OWNER,
    BRIDGE,
    ANYONE,
    EVERYONE,
    LISTINGS_CONTRACT,
    tokens,
  } = await loadFixture(deployTokensFixture);

  let envListingFee: string | undefined = process.env.DEFAULT_LISTING_FEE_GAS;
  const listingFee: number = envListingFee ? parseInt(envListingFee) : 0;

  let envRoyaltyNumerator: string | undefined =
    process.env.DEFAULT_ROYALTY_NUMERATOR;
  const royaltyNumerator: number = envRoyaltyNumerator
    ? parseInt(envRoyaltyNumerator)
    : 0;

  // check gas cost for deployment
  //@ts-ignore
  let listingsFactory: Listings__factory = <Listings__factory>(
    await ethers.getContractFactory("Listings", CEO)
  );

  const estimatedGas = await listingsFactory.signer.estimateGas(
    listingsFactory.getDeployTransaction(
      tokens.address,
      listingFee,
      royaltyNumerator
    )
  );
  console.log("Deployment gas needed:".padEnd(w), estimatedGas.toString());

  const deployerBalance = await listingsFactory.signer.getBalance();
  console.log("Deployer gas (CEO):".padEnd(w), deployerBalance.toString());

  if (deployerBalance.lt(estimatedGas)) {
    throw new Error(
      `Insufficient funds. Top up your account balance by ${ethers.utils.formatEther(
        estimatedGas.sub(deployerBalance)
      )}`
    );
  }

  // deploy Listings contract as the CEO
  let listings: Listings = {} as Listings;
  try {
    listings = await listingsFactory.deploy(
      tokens.address,
      listingFee,
      royaltyNumerator
    );
    await listings.deployed();
    console.log("Deployed listings to:".padEnd(w), listings.address);
  } catch (err) {
    console.log("***** DEPLOYING FAILED!".padEnd(w), err);
  }

  // update tokens contract roles
  let tokensContractAsCEO = new ethers.Contract(
    tokens.address,
    tokens.interface,
    CEO
  );
  await tokensContractAsCEO.revokeRole(
    await tokens.MARKETPLACE_ROLE(),
    LISTINGS_CONTRACT.address
  );
  await tokensContractAsCEO.grantRole(
    await tokens.MARKETPLACE_ROLE(),
    listings.address
  );
  await tokensContractAsCEO.grantRole(
    await tokens.BRIDGE_ROLE(),
    BRIDGE.address
  );

  // set listings contract roles
  let listingsContractAsCEO = new ethers.Contract(
    listings.address,
    listings.interface,
    CEO
  );
  await listingsContractAsCEO.grantRole(await listings.CFO_ROLE(), CFO.address);
  await listingsContractAsCEO.grantRole(
    await listings.SUPERADMIN_ROLE(),
    SUPERADMIN.address
  );

  return {
    CEO,
    CFO,
    SUPERADMIN,
    OWNER,
    BRIDGE,
    ANYONE,
    EVERYONE,
    tokens,
    listings,
  };
}

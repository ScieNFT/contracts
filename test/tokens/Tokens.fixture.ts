import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import type { Tokens } from '../../types/contracts/Tokens';
import { Tokens__factory } from '../../types/factories/contracts/Tokens__factory';

export async function deployTokensFixture(): Promise<{
  CEO: SignerWithAddress;
  CFO: SignerWithAddress;
  SUPERADMIN: SignerWithAddress;
  OWNER: SignerWithAddress;
  ADMIN: SignerWithAddress;
  BENEFICIARY: SignerWithAddress;
  LISTINGS_CONTRACT: SignerWithAddress;
  OFFERS_CONTRACT: SignerWithAddress;
  BRIDGE: SignerWithAddress;
  ANYONE: SignerWithAddress;
  EVERYONE: SignerWithAddress[];
  tokens: Tokens;
}> {
  let uri: string | undefined = process.env.METADATA_JSON_URI;
  const CONTRACT_DEPLOYMENT_URI: string = uri ? uri : 'http://www.scienft.com/token-{id}.json';

  let envInitialMiningYield: string | undefined = process.env.INITIAL_MINING_YIELD_SCI;
  let initialMiningYield = BigNumber.from(envInitialMiningYield).mul(BigNumber.from(10).pow(18));

  let envMinimumMiningYield: string | undefined = process.env.MINIMUM_MINING_YIELD_SCI;
  let minimumMiningYield = BigNumber.from(envMinimumMiningYield).mul(BigNumber.from(10).pow(18));

  let envMiningFee: string | undefined = process.env.MINING_FEE_GAS;
  let miningFee = BigNumber.from(envMiningFee);

  let envDifficulty: string | undefined = process.env.DIFFICULTY;
  let difficulty = BigNumber.from(envDifficulty);

  let envMiningIntervalSeconds: string | undefined = process.env.MINING_INTERVAL_SECONDS;
  let miningIntervalSeconds = BigNumber.from(envMiningIntervalSeconds);

  let envMaxTotalSupply: string | undefined = process.env.MAXIMUM_TOTAL_SUPPLY_SCI;
  let maxTotalSupply = BigNumber.from(envMaxTotalSupply).mul(BigNumber.from(10).pow(18));

  let envMintingFee: string | undefined = process.env.MINTING_FEE_GAS;
  let mintingFee = BigNumber.from(envMintingFee);

  let CEO = {} as SignerWithAddress;
  let CFO = {} as SignerWithAddress;
  let SUPERADMIN = {} as SignerWithAddress;
  let OWNER = {} as SignerWithAddress;
  let ADMIN = {} as SignerWithAddress;
  let BENEFICIARY = {} as SignerWithAddress;
  let LISTINGS_CONTRACT = {} as SignerWithAddress;
  let OFFERS_CONTRACT = {} as SignerWithAddress;
  let BRIDGE = {} as SignerWithAddress;
  let ANYONE = {} as SignerWithAddress;

  const signers: SignerWithAddress[] = await ethers.getSigners();
  [
    CEO,
    CFO,
    SUPERADMIN,
    OWNER,
    ADMIN,
    BENEFICIARY,
    LISTINGS_CONTRACT,
    OFFERS_CONTRACT,
    BRIDGE,
    ANYONE,
  ] = signers;

  const signerNames = [
    'CEO',
    'CFO',
    'SUPERADMIN',
    'OWNER',
    'ADMIN',
    'BENEFICIARY',
    'LISTINGS_CONTRACT',
    'OFFERS_CONTRACT',
    'BRIDGE',
    'ANYONE',
  ];

  const w = 25;

  console.log(`--- Signer addresses and available gas`);
  for (let i = 0; i < signerNames.length; i++) {
    console.log(
      signerNames[i].padEnd(w),
      signers[i].address,
      (await signers[i].getBalance()).toString()
    );
  }

  // check gas cost for deployment
  //@ts-ignore
  let tokensFactory: Tokens__factory = <Tokens__factory>(
    await ethers.getContractFactory('Tokens', CEO)
  );

  const estimatedGas = await tokensFactory.signer.estimateGas(
    tokensFactory.getDeployTransaction(
      CONTRACT_DEPLOYMENT_URI,
      initialMiningYield,
      minimumMiningYield,
      miningFee,
      difficulty,
      miningIntervalSeconds,
      maxTotalSupply,
      mintingFee
    )
  );
  console.log('Deployment gas needed:'.padEnd(w), estimatedGas.toString());

  const deployerBalance = await tokensFactory.signer.getBalance();
  console.log('Deployer gas (CEO):'.padEnd(w), deployerBalance.toString());

  if (deployerBalance.lt(estimatedGas)) {
    throw new Error(
      `Insufficient funds. Top up your account balance by ${ethers.utils.formatEther(
        estimatedGas.sub(deployerBalance)
      )}`
    );
  }

  // deploy contract as the CEO
  let tokens: Tokens = {} as Tokens;
  try {
    tokens = await tokensFactory.deploy(
      CONTRACT_DEPLOYMENT_URI,
      initialMiningYield,
      minimumMiningYield,
      miningFee,
      difficulty,
      miningIntervalSeconds,
      maxTotalSupply,
      mintingFee
    );
    await tokens.deployed();
    console.log('Deployed tokens to:'.padEnd(w), tokens.address);
  } catch (err) {
    console.log('***** DEPLOYING FAILED!'.padEnd(w), err);
  }

  // grant roles (CEO_ROLE will be granted to the sender during deployment)
  const roles: string[] = [
    await tokens.CFO_ROLE(),
    await tokens.SUPERADMIN_ROLE(),
    await tokens.MARKETPLACE_ROLE(),
    await tokens.MARKETPLACE_ROLE(),
    await tokens.BRIDGE_ROLE(),
  ];
  const addresses: string[] = [
    CFO.address,
    SUPERADMIN.address,
    LISTINGS_CONTRACT.address,
    OFFERS_CONTRACT.address,
    BRIDGE.address,
  ];
  const roleNames: string[] = [
    'CFO',
    'SUPERADMIN',
    'LISTINGS:MARKETPLACE_ROLE',
    'OFFERS:MARKETPLACE_ROLE',
    'BRIDGE',
  ];

  console.log(`--- Permissioned addresses and their roles`);
  console.log('CEO'.padEnd(w), CEO.address, await tokens.CEO_ROLE());

  for (const [i, a] of addresses.entries()) {
    await tokens.grantRole(roles[i], a);
    let hasRole = await tokens.hasRole(roles[i], a);
    if (hasRole) {
      console.log(roleNames[i].padEnd(w), a, roles[i], hasRole);
    } else {
      console.error(`failed to grant ${roleNames[i]} to ${addresses[i]}`);
    }
  }

  return {
    CEO,
    CFO,
    SUPERADMIN,
    OWNER,
    ADMIN,
    BENEFICIARY,
    LISTINGS_CONTRACT,
    OFFERS_CONTRACT,
    BRIDGE,
    ANYONE,
    EVERYONE: signers,
    tokens,
  };
}

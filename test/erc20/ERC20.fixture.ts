import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import type { Tokens } from '../../types/contracts/Tokens';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployTokensFixture } from '../tokens/Tokens.fixture';

export async function deployERC20Fixture(): Promise<{
  CEO: SignerWithAddress;
  CFO: SignerWithAddress;
  ALICE: SignerWithAddress;
  BOB: SignerWithAddress;
  CHARLES: SignerWithAddress;
  EVERYONE: SignerWithAddress[];
  tokens: Tokens;
}> {
  // deploy and setup Tokens contract
  const { CEO, CFO, SUPERADMIN, OWNER, BRIDGE, EVERYONE, tokens } = await loadFixture(
    deployTokensFixture
  );

  let ALICE = SUPERADMIN;
  let BOB = OWNER;
  let CHARLES = BRIDGE;

  return { CEO, CFO, ALICE, BOB, CHARLES, EVERYONE, tokens };
}

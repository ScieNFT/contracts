import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import type { Contract } from 'ethers';

import type { Tokens } from '../types/contracts/Tokens';
import type { Listings } from '../types/contracts/Listings';
import type { Offers } from '../types/contracts/Offers';

type Fixture<T> = () => Promise<T>;

declare module 'mocha' {
  export interface Context {
    // contracts
    tokens: Tokens;
    listings: Listings;
    ofers: Offers;

    // roles
    CEO: SignerWithAddress;
    CFO: SignerWithAddress;
    SUPERADMIN: SignerWithAddress;
    OWNER: SignerWithAddress;
    ADMIN: SignerWithAddress;
    BENEFICIARY: SignerWithAddress;
    LISTINGS_CONTRACT: SignerWithAddress;
    BRIDGE: SignerWithAddress;
    ANYONE: SignerWithAddress;
    EVERYONE: SignerWithAddress[]; // all of the above

    ALICE: SignerWithAddress;
    BOB: SignerWithAddress;
    CHARLES: SignerWithAddress;

    loadFixture: <T>(fixture: Fixture<T>) => Promise<T>;
    tokensAs: (signer: SignerWithAddress) => Contract;
    listingsAs: (signer: SignerWithAddress) => Contract;
    offersAs: (signer: SignerWithAddress) => Contract;
  }
}

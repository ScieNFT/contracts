// https://github.com/NomicFoundation/hardhat/issues/2175
// `ts-node ...` doesn't work -- instead use `npx hardhat run`

import { deployAll } from './deployAll';

let reuseOldContracts = false;
let skipSetup = false;
deployAll(reuseOldContracts, skipSetup);

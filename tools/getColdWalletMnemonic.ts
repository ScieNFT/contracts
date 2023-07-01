import { recoverColdWallet } from './secretShares';

/*
 *
 *  PRINT ENV MNEMONIC TO STDOUT FROM COLD WALLET SHARES
 *
 *  This is used with execSync when starting the nest RPC service
 */

console.log(recoverColdWallet());

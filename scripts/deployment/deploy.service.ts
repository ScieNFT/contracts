import type { Tokens as Tokens__contract } from "../../types/contracts/Tokens";
import type { Offers as Offers__contract } from "../../types/contracts/Offers";
import type { Listings as Listings__contract } from "../../types/contracts/Listings";
import hre from "hardhat";
import { Wallet } from "ethers";

export class Contracts {
  static tokens: Tokens__contract;
  static offers: Offers__contract;
  static listings: Listings__contract;
}

export class Signers {
  static CEO: Wallet;
  static CFO: Wallet;
  static SUPERADMIN: Wallet;
}

export class Nonce {
  static CEO_NONCE: number;
  static CFO_NONCE: number;

  public static async resetCEONonce() {
    let next = await Signers.CEO.provider.getTransactionCount(
      Signers.CEO.address,
      "pending"
    );
    Nonce.CEO_NONCE = next;
    console.log(`[NONCE] set first CEO nonce to ${Nonce.CEO_NONCE}`);
  }

  public static async CEO() {
    if (!Nonce.CEO_NONCE) {
      await Nonce.resetCEONonce();
    } else {
      Nonce.CEO_NONCE += 1;
      console.log(`[NONCE] providing CEO nonce = ${Nonce.CEO_NONCE}`);
    }
    return { nonce: Nonce.CEO_NONCE };
  }

  public static async resetCFONonce() {
    let next = await Signers.CFO.provider.getTransactionCount(
      Signers.CFO.address,
      "pending"
    );
    Nonce.CFO_NONCE = next;
    console.log(`[NONCE] set first CFO nonce to ${Nonce.CFO_NONCE}`);
  }

  public static async CFO() {
    if (!Nonce.CFO_NONCE) {
      await Nonce.resetCFONonce();
    } else {
      Nonce.CFO_NONCE += 1;
      console.log(`[NONCE] providing CFO nonce = ${Nonce.CFO_NONCE}`);
    }
    return { nonce: Nonce.CFO_NONCE };
  }
}

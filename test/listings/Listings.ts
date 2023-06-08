import { expect } from "chai";
import { keccak256 } from "@ethersproject/keccak256";
import { toUtf8Bytes } from "@ethersproject/strings";
import { time } from "@nomicfoundation/hardhat-network-helpers";
// @ts-ignore
import { ethers } from "hardhat";

import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployListingsFixture } from "./Listings.fixture";
import { randomBytes } from "crypto";
import { BigNumber, Event } from "ethers";

// arbitrary HASH values
const DATA_HASH = keccak256(toUtf8Bytes("DATA_HASH"));

function calculatedPriceSlopeNumerator(
  startTimeSec: number,
  endTimeSec: number,
  startPriceAttoSci: BigNumber,
  endPriceAttoSci: BigNumber
): BigNumber {
  if (endTimeSec == 0) {
    return BigNumber.from(0);
  }
  if (endTimeSec < startTimeSec) {
    throw "endTimeSec < startTimeSec";
  }
  let priceDifference: BigNumber;
  if (endPriceAttoSci.gt(startPriceAttoSci)) {
    priceDifference = endPriceAttoSci.sub(startPriceAttoSci);
  } else {
    priceDifference = startPriceAttoSci.sub(endPriceAttoSci);
  }
  const timeDifference = BigNumber.from(endTimeSec).sub(startTimeSec);
  const maxNumerator = BigNumber.from(2).pow(64);
  // multiply first to keep precision
  const slopeNumerator = priceDifference.mul(maxNumerator).div(timeDifference);
  return slopeNumerator;
}

describe("Listings Contract", function () {
  beforeEach(async function () {
    const {
      CEO,
      CFO,
      SUPERADMIN,
      OWNER,
      BRIDGE,
      ANYONE,
      EVERYONE,
      tokens,
      listings,
    } = await loadFixture(deployListingsFixture);
    this.tokens = tokens;
    this.listings = listings;
    this.CEO = CEO;
    this.CFO = CFO;
    this.SUPERADMIN = SUPERADMIN;
    this.OWNER = OWNER;
    this.BRIDGE = BRIDGE;
    this.ANYONE = ANYONE;
    this.EVERYONE = EVERYONE;

    this.checkAllRoles = (
      signers: SignerWithAddress[],
      fn: (s: SignerWithAddress) => Promise<any>,
      expectedRejection: string
    ) => {
      return Promise.all(
        signers.map((s: SignerWithAddress) => {
          return fn(s)
            .then((_b: any) => {
              throw new Error(`unexpected success for ${s.address}`);
            })
            .catch((e: Error) => {
              if (e.message.indexOf(expectedRejection) < 0) {
                throw e;
              }
            });
        })
      );
    };

    this.toRevert = (fn: () => Promise<any>, expectedRejection: string) => {
      return fn()
        .then((_b: any) => {
          throw new Error(`unexpected success`);
        })
        .catch((e: Error) => {
          if (e.message.indexOf(expectedRejection) < 0) {
            throw e;
          }
        });
    };

    this.tokensAs = (signer: SignerWithAddress) =>
      new ethers.Contract(tokens.address, tokens.interface, signer);

    this.listingsAs = (signer: SignerWithAddress) =>
      new ethers.Contract(listings.address, listings.interface, signer);

    this.balanceSCI = (s: SignerWithAddress): Promise<number> =>
      this.tokens["balanceOf(address,uint256)"](
        s.address,
        this.tokens.SCI()
      ).then((b: BigNumber) => b.toNumber());

    this.creditSCI = async (s: SignerWithAddress, amount: bigint) => {
      let feeAttoSci = BigNumber.from(12345);
      await this.tokensAs(this.CFO).setMiningFee(feeAttoSci);
      // guess a valid solution using proof of work
      let solution = randomBytes(32);
      let done = false;
      while (!done) {
        solution = randomBytes(32);
        done = await this.tokens.isCorrect(solution);
      }

      let lastTime = BigNumber.from(await time.latest());
      let interval = BigNumber.from(
        await this.tokensAs(this.CFO).miningIntervalSeconds()
      );
      await ethers.provider.send("evm_mine");
      await time.setNextBlockTimestamp(lastTime.add(interval).add(1));
      await ethers.provider.send("evm_mine");

      await this.tokens.mineSCI(solution, this.CFO.address, {
        value: feeAttoSci.toString(),
      });
      await this.tokensAs(this.CFO).transfer(s.address, amount);
    };

    this.balanceNFT = (
      s: SignerWithAddress,
      tokenId: number
    ): Promise<number> =>
      this.tokens["balanceOf(address,uint256)"](s.address, tokenId).then(
        (b: BigNumber) => b.toNumber()
      );

    let _nextNFTIndex: number = await this.tokens.FIRST_NFT();
    this.mintNextNFT = (s = OWNER): Promise<number> =>
      this.tokens.mintingFee().then((fee: BigNumber) => {
        return this.tokensAs(s)
          ["mintNFT(bytes32)"](DATA_HASH, {
            value: fee.toString(),
          })
          .then((_: any) => {
            return _nextNFTIndex++;
          });
      });

    interface ListNFTOptions {
      startPriceAttoSci: string;
      endPriceAttoSci: string;
      durationSec: number;
    }

    this.INFINITE = -1; // helper for listings with endPoint=0
    this.listNFT = async (
      tokenId: number,
      options: ListNFTOptions = {
        // Set default value for options
        startPriceAttoSci: "1000",
        endPriceAttoSci: "0",
        durationSec: -1, // using a negative value to force endTimeSec == 0
      },
      operator = OWNER,
      seller = OWNER
    ): Promise<typeof this.listings.Listing> => {
      await ethers.provider.send("evm_mine");
      let startTimeSec = (await time.latest()) + 1; // advance block
      let endTimeSec =
        options.durationSec > 0 ? startTimeSec + options.durationSec : 0;
      let endPriceAttoSci: BigNumber = BigNumber.from(options.endPriceAttoSci);
      let startPriceAttoSci: BigNumber = BigNumber.from(
        options.startPriceAttoSci
      );
      let priceIncreases = endPriceAttoSci.gt(startPriceAttoSci);
      let priceSlopeNumerator = calculatedPriceSlopeNumerator(
        startTimeSec,
        endTimeSec, // here zero indicates an auction that does not end
        startPriceAttoSci,
        endPriceAttoSci
      );
      await time.setNextBlockTimestamp(startTimeSec);
      await ethers.provider.send("evm_mine");

      let fee =
        operator.address == this.SUPERADMIN.address
          ? 0
          : await this.listings.listingFee();
      await this.listingsAs(operator).setListing(
        tokenId,
        seller.address,
        startTimeSec,
        endTimeSec,
        startPriceAttoSci,
        priceIncreases,
        priceSlopeNumerator,
        { value: fee.toString() }
      );

      return {
        seller: seller.address,
        startTimeSec,
        endTimeSec,
        startPriceAttoSci,
        priceIncreases,
        priceSlopeNumerator,
      };
    };
  });

  describe("Deployment", function () {
    it("should connect to the Tokens contract", async function () {
      let tokensAddress = await this.listings.tokens();
      expect(tokensAddress).to.equal(this.tokens.address);
      expect(
        await this.tokens.hasRole(
          await this.tokens.MARKETPLACE_ROLE(),
          this.listings.address
        )
      ).to.be.true;
    });

    it("should set parameters to values in env", async function () {
      let envListingFee: string | undefined =
        process.env.DEFAULT_LISTING_FEE_GAS;
      const listingFee: number = envListingFee ? parseInt(envListingFee) : 0;
      expect(await this.listings.listingFee()).to.be.equal(listingFee);

      let envRoyaltyNumerator: string | undefined =
        process.env.DEFAULT_ROYALTY_NUMERATOR;
      const royaltyNumerator: number = envRoyaltyNumerator
        ? parseInt(envRoyaltyNumerator)
        : 0;
      expect(await this.listings.royaltyNumerator()).to.be.equal(
        royaltyNumerator
      );
    });

    it("should have the CEO_ROLE value match the AccessControl default of 0x0", async function () {
      expect(await this.listings.CEO_ROLE()).to.equal(
        "0x0000000000000000000000000000000000000000000000000000000000000000"
      );
    });

    it("should grant the CEO role to contract deployment sender", async function () {
      expect(
        await this.listings.hasRole(
          await this.listings.CEO_ROLE(),
          this.CEO.address
        )
      ).to.be.true;
    });

    it("should grant the CFO role in the fixture", async function () {
      expect(
        await this.listings.hasRole(
          await this.listings.CFO_ROLE(),
          this.CFO.address
        )
      ).to.be.true;
    });

    it("should support all expected ERC165 interfaces", async function () {
      function toBytes4(s: string) {
        var b4 = new Uint8Array(4);
        for (var i = 0; i < 4; i++) {
          b4[i] = parseInt(s.substring(i * 2, (i + 1) * 2), 16);
        }
        return b4;
      }
      const IID_IACCESS_CONTROL = toBytes4("7965db0b"); // type(IAccessControl).interfaceId
      const IID_IERC1155_RECEIVER = toBytes4("4e2312e0"); // type(IERC1155Receiver).interfaceId;
      const IID_IERC165 = toBytes4("01ffc9a7"); // type(IERC165).interfaceId
      expect(await this.listings.supportsInterface(IID_IACCESS_CONTROL)).to.be
        .true;
      expect(await this.listings.supportsInterface(IID_IERC1155_RECEIVER)).to.be
        .true;
      expect(await this.listings.supportsInterface(IID_IERC165)).to.be.true;
    });

    it("should revert transfers of gas tokens to contract address", async function () {
      await this.toRevert(async () => {
        await this.CEO.sendTransaction({
          to: this.listings.address,
          value: 100,
        });
      }, "receive() reverts");
    });

    it("should revert on fallback", async function () {
      const nonExistentFuncSignature = "nonExistentFunc(uint256,uint256)";
      const fakeDemoContract = new ethers.Contract(
        this.listings.address,
        [
          ...this.listings.interface.fragments,
          `function ${nonExistentFuncSignature}`,
        ],
        this.CEO
      );
      await this.toRevert(async () => {
        await fakeDemoContract[nonExistentFuncSignature](8, 9);
      }, "fallback() reverts");
    });
  });

  describe("new setListing", function () {
    it("should revert for offchain NFT", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).withdrawFromContract(
        tokenId,
        this.BRIDGE.address
      );
      expect(await this.tokens.isBridged(tokenId)).to.equal(true);

      await this.toRevert(async () => {
        await this.listNFT(tokenId);
      }, "NFT is bridged");
    });

    it("should create a listing with endTimeSec > block.timestamp", async function () {
      // mint a few NFTs and list the last one
      let tokenId = await this.mintNextNFT();
      tokenId = await this.mintNextNFT();
      tokenId = await this.mintNextNFT();
      tokenId = await this.mintNextNFT();

      //TODO: custom limited approval code for SCI and NFTs
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      let providedListing: typeof this.listings.Listing = await this.listNFT(
        tokenId
      );

      expect(await this.tokens.isFullBenefit(tokenId)).to.true;
      expect(await this.tokens.willUnsetFullBenefit(tokenId)).to.true;

      let actualListing = await this.listings.sellerListings(tokenId);
      expect(actualListing.seller).to.equal(providedListing.seller);
      expect(actualListing.startTimeSec).to.equal(providedListing.startTimeSec);
      expect(actualListing.endTimeSec).to.equal(providedListing.endTimeSec);
      expect(actualListing.startPriceAttoSci).to.equal(
        providedListing.startPriceAttoSci
      );
      expect(actualListing.priceIncreases).to.equal(
        providedListing.priceIncreases
      );
      expect(actualListing.priceSlopeNumerator).to.equal(
        providedListing.priceSlopeNumerator
      );
    });

    it("should create an indefinite listing with endTimeSec == 0", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );

      // we will create this listing using the SUPERADMIN as the operator
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.SUPERADMIN.address,
        true
      );

      let providedListing: typeof this.listings.Listing = await this.listNFT(
        tokenId,
        {
          startPriceAttoSci: "1000",
          endPriceAttoSci: "1500", // ignored
          durationSec: this.INFINITE,
        },
        this.SUPERADMIN, // operator
        this.OWNER // seller
      );

      let actualListing = await this.listings.sellerListings(tokenId);
      expect(actualListing.seller).to.equal(this.OWNER.address);
      expect(actualListing.startTimeSec).to.equal(providedListing.startTimeSec);
      expect(actualListing.endTimeSec).to.equal(0);
      expect(actualListing.startPriceAttoSci).to.equal(
        providedListing.startPriceAttoSci
      );
      expect(actualListing.priceIncreases).to.equal(
        providedListing.priceIncreases
      );
      expect(actualListing.priceSlopeNumerator).to.equal(0);
    });

    it("should revert when trying to create an auction with a fungible token", async function () {
      await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );

      await this.toRevert(async () => {
        await this.listNFT(0);
      }, "Invalid NFT");
    });

    it("should revert for an NFT if the blocklist flag set", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.SUPERADMIN).blocklist(tokenId, true);
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );

      await this.toRevert(async () => {
        await this.listNFT(tokenId);
      }, "NFT is blocklisted");
    });

    it("should revert if updating and a fee is included", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.listNFT(tokenId);

      await this.toRevert(async () => {
        await this.listNFT(tokenId);
      }, "Wrong listing fee");
    });

    it("should revert when endTimeSec <= startTimeSec", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );

      // revert if completely in the past
      await this.toRevert(async () => {
        await this.listingsAs(this.OWNER).setListing(
          tokenId,
          this.OWNER.address,
          (await time.latest()) - 1000,
          (await time.latest()) - 500,
          BigNumber.from(100),
          false,
          BigNumber.from(1),
          { value: (await this.listings.listingFee()).toString() }
        );
      }, "Invalid end time");

      // revert if endTime < startTime
      await this.toRevert(async () => {
        await this.listingsAs(this.OWNER).setListing(
          tokenId,
          this.OWNER.address,
          (await time.latest()) + 1000,
          (await time.latest()) + 500,
          BigNumber.from(100),
          true,
          BigNumber.from(1),
          { value: (await this.listings.listingFee()).toString() }
        );
      }, "Invalid start time");
    });

    it("should revert with zero fee payment", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );

      // can't use helper because we want it to break
      let startTimeSec = await time.latest();
      let endTimeSec = startTimeSec + 100;
      let startPriceAttoSci = BigNumber.from(100);
      let priceSlopeNumerator = calculatedPriceSlopeNumerator(
        startTimeSec,
        endTimeSec,
        startPriceAttoSci,
        BigNumber.from(0)
      );
      await ethers.provider.send("evm_mine");
      await time.setNextBlockTimestamp(endTimeSec + 1);
      await ethers.provider.send("evm_mine");

      await this.toRevert(async () => {
        await this.listingsAs(this.OWNER).setListing(
          tokenId,
          this.OWNER.address,
          startTimeSec,
          endTimeSec,
          startPriceAttoSci,
          false,
          priceSlopeNumerator,
          { value: 0 }
        );
      }, "Wrong listing fee");
    });

    it("should allow with zero fee payment for SUPERADMIN", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );

      await this.listingsAs(this.SUPERADMIN).setListing(
        tokenId,
        this.OWNER.address,
        (await time.latest()) + 100,
        (await time.latest()) + 500,
        BigNumber.from(100),
        false,
        BigNumber.from(1),
        { value: 0 }
      );

      // this call is an update so it reverts with a payment
      await this.toRevert(async () => {
        await this.listingsAs(this.SUPERADMIN).setListing(
          tokenId,
          this.OWNER.address,
          (await time.latest()) + 100,
          (await time.latest()) + 500,
          BigNumber.from(100),
          false,
          BigNumber.from(1),
          { value: 10 }
        );
      }, "Wrong listing fee");

      // this is a new listing but SUPERADMIN should not pay a fee
      tokenId = await this.mintNextNFT();
      await this.toRevert(async () => {
        await this.listingsAs(this.SUPERADMIN).setListing(
          tokenId,
          this.OWNER.address,
          (await time.latest()) + 100,
          (await time.latest()) + 500,
          BigNumber.from(100),
          false,
          BigNumber.from(1),
          { value: 10 }
        );
      }, "Wrong listing fee");
    });

    it("should revert with overpayment of listing fee", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );

      // can't use helper because we want it to break
      let startTimeSec = await time.latest();
      let endTimeSec = startTimeSec + 100;
      let startPriceAttoSci = BigNumber.from(100);
      let priceSlopeNumerator = calculatedPriceSlopeNumerator(
        startTimeSec,
        endTimeSec,
        startPriceAttoSci,
        BigNumber.from(0)
      );
      await ethers.provider.send("evm_mine");
      await time.setNextBlockTimestamp(endTimeSec + 1);
      await ethers.provider.send("evm_mine");

      await this.toRevert(async () => {
        await this.listingsAs(this.OWNER).setListing(
          tokenId,
          this.OWNER.address,
          startTimeSec,
          endTimeSec,
          startPriceAttoSci,
          false,
          priceSlopeNumerator,
          { value: (await this.listings.listingFee()).mul(2).toString() }
        );
      }, "Wrong listing fee");
    });

    it("should revert if permissions are wrong", async function () {
      // setup tokens
      let tokenId = await this.mintNextNFT();
      await this.creditSCI(this.ANYONE, 1000);

      // create listing in the distant future
      let startTimeSec = await time.latest();
      let endTimeSec = startTimeSec + 100;
      let startPriceAttoSci = BigNumber.from(100);
      let priceSlopeNumerator = calculatedPriceSlopeNumerator(
        startTimeSec,
        endTimeSec,
        startPriceAttoSci,
        BigNumber.from(0)
      );
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );

      await this.listingsAs(this.OWNER).denySuperadminControl(true);
      await this.toRevert(async () => {
        await this.listingsAs(this.SUPERADMIN).setListing(
          tokenId,
          this.OWNER.address,
          startTimeSec,
          endTimeSec,
          startPriceAttoSci,
          false,
          priceSlopeNumerator,
          { value: (await this.listings.listingFee()).toString() }
        );
      }, "SELLER has denied SUPERADMIN");

      await this.toRevert(async () => {
        await this.listingsAs(this.CEO).setListing(
          tokenId,
          this.OWNER.address,
          startTimeSec,
          endTimeSec,
          startPriceAttoSci,
          false,
          priceSlopeNumerator,
          { value: (await this.listings.listingFee()).toString() }
        );
      }, "Only SELLER or SUPERADMIN");
    });
  });

  describe("acceptListing", function () {
    it("should revert when paused", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.listNFT(tokenId);

      await this.listingsAs(this.CEO).pause();

      await this.tokensAs(this.ANYONE).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.toRevert(async () => {
        await this.listingsAs(this.ANYONE).acceptListing(
          this.ANYONE.address,
          tokenId,
          100
        );
      }, "Pausable: paused");
    });

    it("should revert when price exceeds maxPrice", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.listNFT(tokenId);

      await this.tokensAs(this.ANYONE).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.toRevert(async () => {
        await this.listingsAs(this.ANYONE).acceptListing(
          this.ANYONE.address,
          tokenId,
          10
        );
      }, "Price exceeds limit");
    });

    it("should accept when price is below maxPrice", async function () {
      let amount = 10000;
      await this.creditSCI(this.ANYONE, amount);

      let tokenId = await this.mintNextNFT();
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(1);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.ANYONE, tokenId)).to.equal(0);

      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.listNFT(tokenId);

      let price = await this.listings["getListingPrice(uint64)"](tokenId);
      expect(price).to.equal(1000);

      await this.toRevert(async () => {
        await this.listings["getListingPrice(uint64)"](tokenId + 1);
      }, "Invalid NFT");

      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);
      expect(await this.balanceNFT(this.ANYONE, tokenId)).to.equal(0);

      await this.tokensAs(this.ANYONE).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.listingsAs(this.ANYONE).acceptListing(
        this.ANYONE.address,
        tokenId,
        10000
      );

      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.ANYONE, tokenId)).to.equal(1);
    });

    it("should revert for an invalid NFT", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.listNFT(tokenId);

      await this.tokensAs(this.ANYONE).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.toRevert(async () => {
        await this.listingsAs(this.ANYONE).acceptListing(
          this.ANYONE.address,
          tokenId + 1,
          5000
        );
      }, "Invalid NFT");
    });

    it("should exchange tokens as expected in a fixed price auction", async function () {
      // set the listing fee
      let listingFee = ethers.BigNumber.from(1234567);

      let tx = await this.listingsAs(this.CFO).setListingFee(listingFee);
      const receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == "ListingFeeSet"))
        .to.not.be.null;
      expect(receipt.events[0].args.listingFee).to.equal(listingFee);

      // fund accounts with SCI tokens
      let amount = 10000;
      await this.creditSCI(this.OWNER, amount);
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.OWNER)).to.equal(amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);

      // mint the NFT as OWNER
      let tokenId = await this.mintNextNFT();
      expect(await this.tokens.isMinted(tokenId)).to.be.true;

      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(1);

      expect(await this.tokens.isFullBenefit(tokenId)).to.true;
      expect(await this.tokens.willUnsetFullBenefit(tokenId)).to.true;

      expect(
        await this.tokens.hasRole(
          await this.tokens.MARKETPLACE_ROLE(),
          this.listings.address
        )
      ).to.be.true;
      expect(
        (await this.tokens.scienceNFTs(tokenId)).status.toNumber() &
          (await this.tokens.UNSET_FULL_BENEFIT_FLAG())
      ).to.gt(0);

      let fixedPriceAttoSci = BigNumber.from(6543);
      // create a fixed price listing
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      let providedListing = await this.listNFT(tokenId, {
        startPriceAttoSci: fixedPriceAttoSci.toString(), //need to be less than amount above (10k)
        endPriceAttoSci: "0", // ignored
        durationSec: this.INFINITE,
      });

      // check that the correct listing fee was paid (contract is back to original gas)
      let initialAnyoneBalance = await this.ANYONE.getBalance();

      // don't withdraw too much
      await this.toRevert(async () => {
        await this.listingsAs(this.CFO).withdraw(
          this.ANYONE.address,
          listingFee.add(100)
        );
      }, "Value exceeds balance");

      await this.listingsAs(this.CFO).withdraw(this.ANYONE.address, listingFee);
      expect(await this.ANYONE.getBalance()).to.equal(
        initialAnyoneBalance.add(listingFee)
      );
      expect(
        await this.listings.provider.getBalance(this.listings.address)
      ).to.equal(0);

      // check that NFT now belongs to the contract
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);
      expect(await this.balanceNFT(this.ANYONE, tokenId)).to.equal(0);

      // we can still change the beneficiary even though the listing is active
      // TODO -- consider if this is desirable
      await this.tokensAs(this.OWNER).setBeneficiary(tokenId, this.CEO.address);

      // set the royalty to 50% (ignored because of full benefit flag)
      let tx2 = await this.listingsAs(this.CFO).setRoyaltyNumerator(128);
      const receipt2 = await tx2.wait();
      expect(
        receipt2.events?.filter((x: Event) => x.event == "RoyaltyNumeratorSet")
      ).to.not.be.null;
      expect(receipt2.events[0].args.royaltyNumerator).to.equal(128);

      expect(await this.listings.royaltyNumerator()).to.be.equal(128);

      let buyerSCIBefore = BigNumber.from(await this.balanceSCI(this.ANYONE));
      let sellerSCIBefore = BigNumber.from(await this.balanceSCI(this.OWNER));
      let beneficiarySCIBefore = BigNumber.from(
        await this.balanceSCI(this.CEO)
      );

      let fullBenefit = await this.tokens.isFullBenefit(tokenId);

      // buy the NFT as ANYONE
      await this.tokensAs(this.ANYONE).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.listingsAs(this.ANYONE).acceptListing(
        this.ANYONE.address,
        tokenId,
        fixedPriceAttoSci
      );

      // check that flags are updated correctly
      expect(await this.tokens.isFullBenefit(tokenId)).to.be.false;
      expect(await this.tokens.willUnsetFullBenefit(tokenId)).to.be.false;

      // check that NFT was transferred
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.ANYONE, tokenId)).to.equal(1);

      let buyerPaidSCI = buyerSCIBefore.sub(await this.balanceSCI(this.ANYONE));
      let sellerReceivedSCI = BigNumber.from(
        await this.balanceSCI(this.OWNER)
      ).sub(sellerSCIBefore);
      let beneficiaryReceivedSCI = BigNumber.from(
        await this.balanceSCI(this.CEO)
      ).sub(beneficiarySCIBefore);

      // proceeds to beneficiary based on FULL_BENEFIT_FLAG
      expect(await this.tokens.isFullBenefit(tokenId)).to.false;

      let r = (await this.listings.royaltyNumerator()) / 256.0;

      expect(beneficiaryReceivedSCI).to.be.equal(
        fullBenefit ? fixedPriceAttoSci : r * fixedPriceAttoSci.toNumber()
      );
      expect(sellerReceivedSCI).to.be.equal(
        fullBenefit ? 0 : (1 - r) * fixedPriceAttoSci.toNumber()
      );
      expect(buyerPaidSCI).to.be.equal(fixedPriceAttoSci);

      expect((await this.listings.sellerListings(tokenId)).seller).to.equal(
        ethers.constants.AddressZero
      );

      expect(
        await this.listings.provider.getBalance(this.listings.address)
      ).to.equal(0);
    });

    it("should exchange tokens as expected in two declining price auctions", async function () {
      // in this test, we will observe the sale of an NFT twice along its auction curve

      // fund accounts with SCI tokens
      let amount = 20000;
      await this.creditSCI(this.OWNER, amount);
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.OWNER, amount)).to.equal(amount);
      expect(await this.balanceSCI(this.ANYONE, amount)).to.equal(amount);

      // sell NFT #4
      await this.mintNextNFT();
      await this.mintNextNFT();
      await this.mintNextNFT();
      let tokenId = await this.mintNextNFT();
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(1);
      expect(await this.tokens.isFullBenefit(tokenId)).to.true;
      expect(await this.tokens.willUnsetFullBenefit(tokenId)).to.true;

      // set the beneficiary to be the CEO
      await this.tokensAs(this.OWNER).setBeneficiary(tokenId, this.CEO.address);

      // create the first auction listing
      let startPriceAttoSci = BigNumber.from(12000);
      let endPriceAttoSci = BigNumber.from(2000);
      let durationSec = 100000;
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );

      let providedListing = await this.listNFT(tokenId, {
        startPriceAttoSci: startPriceAttoSci.toString(),
        endPriceAttoSci: endPriceAttoSci.toString(),
        durationSec: durationSec,
      });

      expect(await this.tokens.isFullBenefit(tokenId)).to.true;
      expect(await this.tokens.willUnsetFullBenefit(tokenId)).to.true;

      // check that NFT now belongs to the contract
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);

      // set the royalty value to 25% (64/256)
      let royaltyNumeratorValue = 64;
      await this.listingsAs(this.CFO).setRoyaltyNumerator(
        royaltyNumeratorValue
      );
      expect(await this.listings.royaltyNumerator()).to.be.equal(
        royaltyNumeratorValue
      );

      // initial balances
      let buyerSCIBefore = BigNumber.from(await this.balanceSCI(this.ANYONE));
      let sellerSCIBefore = BigNumber.from(await this.balanceSCI(this.OWNER));
      let beneficiarySCIBefore = BigNumber.from(
        await this.balanceSCI(this.CEO)
      );

      // set the time of purchase along the auction
      let f = 0.2;
      let targetTimeSec =
        (1 - f) * providedListing.startTimeSec + f * providedListing.endTimeSec;
      let expectedPriceAttoSci = startPriceAttoSci
        .mul(4)
        .div(5)
        .add(endPriceAttoSci.mul(1).div(5));

      // purchase as ANYONE
      await this.tokensAs(this.ANYONE).setApprovalForAll(
        this.listings.address,
        true
      );

      // include some tests here for expected reverting cases
      await this.listingsAs(this.ANYONE).denySuperadminControl(true);
      await this.toRevert(async () => {
        await this.listingsAs(this.SUPERADMIN).acceptListing(
          this.ANYONE.address,
          tokenId,
          expectedPriceAttoSci
        );
      }, "BUYER has denied SUPERADMIN");
      await this.toRevert(async () => {
        await this.listingsAs(this.CEO).acceptListing(
          this.ANYONE.address,
          tokenId,
          expectedPriceAttoSci
        );
      }, "Only BUYER or SUPERADMIN");
      await this.listingsAs(this.ANYONE).denySuperadminControl(false);

      // set blocktime
      await ethers.provider.send("evm_mine");
      await time.setNextBlockTimestamp(Math.round(targetTimeSec));
      await ethers.provider.send("evm_mine");

      // accept the listing
      await this.listingsAs(this.SUPERADMIN).acceptListing(
        this.ANYONE.address,
        tokenId,
        expectedPriceAttoSci
      );

      // check that flags are updated correctly
      expect(await this.tokens.isFullBenefit(tokenId)).to.false;
      expect(await this.tokens.willUnsetFullBenefit(tokenId)).to.false;

      // check that NFT was transferred
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.ANYONE, tokenId)).to.equal(1);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(0);

      // check that the correct amounts were paid
      let buyerPaidSCI = buyerSCIBefore.sub(await this.balanceSCI(this.ANYONE));
      let sellerReceivedSCI = BigNumber.from(
        await this.balanceSCI(this.OWNER)
      ).sub(sellerSCIBefore);
      let beneficiaryReceivedSCI = BigNumber.from(
        await this.balanceSCI(this.CEO)
      ).sub(beneficiarySCIBefore);

      // first sale proceeds (full benefit to beneficiary)
      let expectedRoyalty = expectedPriceAttoSci;
      expect(beneficiaryReceivedSCI).to.be.equal(expectedRoyalty);
      expect(sellerReceivedSCI).to.be.equal(
        expectedPriceAttoSci.sub(expectedRoyalty)
      );
      expect(buyerPaidSCI).to.be.equal(expectedPriceAttoSci);
      expect((await this.listings.sellerListings(tokenId)).seller).to.equal(
        ethers.constants.AddressZero
      );

      // relist the NFT and observe a second sale

      // the NFT admin should be unchanged by the sale (still the OWNER)
      await this.toRevert(async () => {
        await this.tokensAs(this.ANYONE).setBeneficiary(
          tokenId,
          this.OWNER.address
        );
      }, "Only ADMIN");

      // actually change beneficiary, as OWNER acting as the ADMIN, to OWNER
      await this.tokensAs(this.OWNER).setBeneficiary(
        tokenId,
        this.OWNER.address
      );

      // relist as the new owner (ANYONE)
      startPriceAttoSci = BigNumber.from(2000);
      endPriceAttoSci = BigNumber.from(200);
      durationSec = 10000;
      providedListing = await this.listNFT(
        tokenId,
        {
          startPriceAttoSci: startPriceAttoSci.toString(),
          endPriceAttoSci: endPriceAttoSci.toString(),
          durationSec: durationSec,
        },
        this.ANYONE, // agent
        this.ANYONE // seller
      );

      // check that NFT now belongs to the contract
      expect(await this.balanceNFT(this.ANYONE, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);

      // get initial balances for each actor
      buyerSCIBefore = BigNumber.from(await this.balanceSCI(this.CEO));
      sellerSCIBefore = BigNumber.from(await this.balanceSCI(this.ANYONE));
      beneficiarySCIBefore = BigNumber.from(await this.balanceSCI(this.OWNER));

      // set the time of purchase
      f = 0.6;
      targetTimeSec =
        (1 - f) * providedListing.startTimeSec + f * providedListing.endTimeSec;
      let expectedPricefixedPrice = startPriceAttoSci
        .mul(4)
        .div(10)
        .add(endPriceAttoSci.mul(6).div(10));

      await this.tokensAs(this.CEO).setApprovalForAll(
        this.listings.address,
        true
      );

      // purchase
      await ethers.provider.send("evm_mine");
      await time.setNextBlockTimestamp(
        BigNumber.from(Math.round(targetTimeSec))
      );
      await ethers.provider.send("evm_mine");
      await this.listingsAs(this.CEO).acceptListing(
        this.CEO.address,
        tokenId,
        5000
      );

      // check that NFT was transferred to the CEO as directed
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.CEO, tokenId)).to.equal(1);
      expect(await this.balanceNFT(this.ANYONE, tokenId)).to.equal(0);

      buyerPaidSCI = buyerSCIBefore.sub(await this.balanceSCI(this.CEO));
      sellerReceivedSCI = BigNumber.from(
        await this.balanceSCI(this.ANYONE)
      ).sub(sellerSCIBefore);
      beneficiaryReceivedSCI = BigNumber.from(
        await this.balanceSCI(this.OWNER)
      ).sub(beneficiarySCIBefore);

      // second sale proceeds
      expect(beneficiaryReceivedSCI).to.be.equal(
        expectedPricefixedPrice.mul(royaltyNumeratorValue).div(256)
      );
      expect(sellerReceivedSCI).to.be.equal(
        expectedPricefixedPrice
          .mul(BigNumber.from(256).sub(royaltyNumeratorValue))
          .div(256)
      );
      expect(buyerPaidSCI).to.be.equal(expectedPricefixedPrice);
    });

    it("should exchange tokens as expected in an increasing price auction", async function () {
      // in this test, we will observe the sale of an NFT that increases in price

      // fund accounts with SCI tokens
      let amount = 123456;
      await this.creditSCI(this.OWNER, amount);
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.OWNER, amount)).to.equal(amount);
      expect(await this.balanceSCI(this.ANYONE, amount)).to.equal(amount);

      // sell two NFTs
      let tokenId1 = await this.mintNextNFT();
      let tokenId2 = await this.mintNextNFT();
      expect(await this.balanceNFT(this.OWNER, tokenId1)).to.equal(1);
      expect(await this.balanceNFT(this.OWNER, tokenId2)).to.equal(1);

      // set the beneficiary to be the CEO
      await this.tokensAs(this.OWNER).setBeneficiary(
        tokenId1,
        this.CEO.address
      );
      await this.tokensAs(this.OWNER).setBeneficiary(
        tokenId2,
        this.CEO.address
      );

      // remove the full benefit flags before we list
      await this.tokensAs(this.OWNER).setFullBenefitFlag(tokenId1, false);
      await this.tokensAs(this.OWNER).setFullBenefitFlag(tokenId2, false);

      // create the first listing
      let startPriceAttoSci = BigNumber.from(0);
      let endPriceAttoSci = BigNumber.from(20000);
      let durationSec = 100000; // make sure this is long enough for the second listing to complete...
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );

      let providedListing = await this.listNFT(tokenId1, {
        startPriceAttoSci: startPriceAttoSci.toString(),
        endPriceAttoSci: endPriceAttoSci.toString(),
        durationSec: durationSec,
      });

      // set the time of purchase and calculate price
      let f = 0.25;
      let targetTimeSec = Math.round(
        (1 - f) * providedListing.startTimeSec + f * providedListing.endTimeSec
      );
      let expectedPriceAttoSci = startPriceAttoSci
        .mul(3)
        .div(4)
        .add(endPriceAttoSci.mul(1).div(4));

      // add a second fixed price listing
      let fixedPriceAttoSci = BigNumber.from(10000);
      await this.listNFT(tokenId2, {
        startPriceAttoSci: fixedPriceAttoSci.toString(),
        endPriceAttoSci: fixedPriceAttoSci.toString(),
        durationSec: this.INFINITE,
      });

      // check that both NFTs now belong to the contract
      expect(await this.balanceNFT(this.OWNER, tokenId1)).to.equal(0);
      expect(await this.balanceNFT(this.OWNER, tokenId2)).to.equal(0);
      expect(await this.balanceNFT(this.listings, tokenId1)).to.equal(1);
      expect(await this.balanceNFT(this.listings, tokenId2)).to.equal(1);

      let buyerSCIBefore = BigNumber.from(await this.balanceSCI(this.ANYONE));
      let sellerSCIBefore = BigNumber.from(await this.balanceSCI(this.OWNER));
      let beneficiarySCIBefore = BigNumber.from(
        await this.balanceSCI(this.CEO)
      );

      expect(targetTimeSec).to.be.gt(
        await time.latest(),
        "block timestamp is ahead of desired purchase time!"
      );

      // benefit flags before purchase should both be false
      expect(await this.tokens.isFullBenefit(tokenId1)).to.false;
      expect(await this.tokens.isFullBenefit(tokenId2)).to.false;

      // purchase both listings as ANYONE
      await this.tokensAs(this.ANYONE).setApprovalForAll(
        this.listings.address,
        true
      );

      await ethers.provider.send("evm_mine");
      await time.setNextBlockTimestamp(
        BigNumber.from(Math.round(targetTimeSec))
      );
      await ethers.provider.send("evm_mine");

      await this.listingsAs(this.ANYONE).acceptListing(
        this.ANYONE.address,
        tokenId1,
        12000
      );
      await this.listingsAs(this.ANYONE).acceptListing(
        this.ANYONE.address,
        tokenId2,
        12000
      );

      // check that NFTs were transferred
      expect(await this.balanceNFT(this.listings, tokenId1)).to.equal(0);
      expect(await this.balanceNFT(this.listings, tokenId2)).to.equal(0);
      expect(await this.balanceNFT(this.ANYONE, tokenId1)).to.equal(1);
      expect(await this.balanceNFT(this.ANYONE, tokenId2)).to.equal(1);

      let buyerPaidSCI = buyerSCIBefore.sub(await this.balanceSCI(this.ANYONE));
      let sellerReceivedSCI = BigNumber.from(
        await this.balanceSCI(this.OWNER)
      ).sub(sellerSCIBefore);
      let beneficiaryReceivedSCI = BigNumber.from(
        await this.balanceSCI(this.CEO)
      ).sub(beneficiarySCIBefore);

      // check sale proceeds
      let royaltyTokenId1 = expectedPriceAttoSci
        .mul(await this.listings.royaltyNumerator())
        .div(256);

      let royaltyTokenId2 = fixedPriceAttoSci
        .mul(await this.listings.royaltyNumerator())
        .div(256);

      let totalRoyalty = royaltyTokenId1.add(royaltyTokenId2);
      let totalPaid = expectedPriceAttoSci.add(fixedPriceAttoSci);

      expect(beneficiaryReceivedSCI).to.be.equal(totalRoyalty);
      expect(sellerReceivedSCI).to.be.equal(totalPaid.sub(totalRoyalty));
      expect(buyerPaidSCI).to.be.equal(totalPaid);

      expect((await this.listings.sellerListings(tokenId1)).seller).to.equal(
        ethers.constants.AddressZero
      );
      expect((await this.listings.sellerListings(tokenId2)).seller).to.equal(
        ethers.constants.AddressZero
      );
    });

    it("should revert when endTimeSec > block.timestamp", async function () {
      // setup tokens
      let tokenId = await this.mintNextNFT();
      await this.creditSCI(this.ANYONE, 1000);

      // create listing
      let startTimeSec = (await time.latest()) + 100;
      let endTimeSec = startTimeSec + 100;
      let startPriceAttoSci = BigNumber.from(100);
      let priceSlopeNumerator = calculatedPriceSlopeNumerator(
        startTimeSec,
        endTimeSec,
        startPriceAttoSci,
        BigNumber.from(0)
      );

      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      let tx = await this.listingsAs(this.OWNER).setListing(
        tokenId,
        this.OWNER.address,
        startTimeSec,
        endTimeSec,
        startPriceAttoSci,
        false,
        priceSlopeNumerator,
        { value: (await this.listings.listingFee()).toString() }
      );

      const receipt = await tx.wait();

      const iface = new ethers.utils.Interface([
        "event TransferSingle(address indexed _operator, address indexed _from,  address indexed _to, uint256 _id, uint256 _value)",
      ]);

      let TransferSingleEvent;
      for (let log of receipt.logs) {
        const parsed = iface.parseLog(log);
        if (parsed.name === "TransferSingle") {
          TransferSingleEvent = parsed;
          break;
        }
      }
      expect(TransferSingleEvent.args._id).to.equal(tokenId);
      expect(TransferSingleEvent.args._from).to.equal(this.OWNER.address);
      expect(TransferSingleEvent.args._to).to.equal(this.listings.address);
      expect(TransferSingleEvent.args._value).to.equal(1);

      expect(receipt.events?.filter((x: Event) => x.event == "ListingUpdated"))
        .to.not.be.null;
      let ListingUpdatedEvent = receipt.events.find(
        (e: any) => e.event == "ListingUpdated"
      );
      expect(ListingUpdatedEvent.args.tokenId).to.equal(tokenId);
      expect(ListingUpdatedEvent.args.seller).to.equal(this.OWNER.address);
      expect(ListingUpdatedEvent.args.startTimeSec).to.equal(startTimeSec);
      expect(ListingUpdatedEvent.args.endTimeSec).to.equal(endTimeSec);
      expect(ListingUpdatedEvent.args.startPriceAttoSci).to.equal(
        startPriceAttoSci
      );
      expect(ListingUpdatedEvent.args.priceIncreases).to.equal(false);
      expect(ListingUpdatedEvent.args.priceSlopeNumerator).to.equal(
        priceSlopeNumerator
      );

      // move past listing endTimeSec
      await ethers.provider.send("evm_mine");
      await time.setNextBlockTimestamp(endTimeSec + 1);
      await ethers.provider.send("evm_mine");

      // purchase should revert
      await this.tokensAs(this.ANYONE).setApprovalForAll(
        this.listings.address,
        true
      );

      await this.toRevert(async () => {
        await this.listingsAs(this.ANYONE).acceptListing(
          this.ANYONE.address,
          tokenId,
          5000
        );
      }, "Listing has expired");
    });

    it("should revert when block.timestamp < startTimeSec", async function () {
      // setup tokens
      let tokenId = await this.mintNextNFT();
      await this.creditSCI(this.ANYONE, 1000);

      // create listing in the distant future
      let startTimeSec = (await time.latest()) + 100000;
      let endTimeSec = startTimeSec + 100;
      let startPriceAttoSci = BigNumber.from(100);
      let priceSlopeNumerator = calculatedPriceSlopeNumerator(
        startTimeSec,
        endTimeSec,
        startPriceAttoSci,
        BigNumber.from(0)
      );
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.listingsAs(this.OWNER).setListing(
        tokenId,
        this.OWNER.address,
        startTimeSec,
        endTimeSec,
        startPriceAttoSci,
        false,
        priceSlopeNumerator,
        { value: (await this.listings.listingFee()).toString() }
      );

      // purchase should revert
      await this.tokensAs(this.ANYONE).setApprovalForAll(
        this.listings.address,
        true
      );

      await this.toRevert(async () => {
        await this.listingsAs(this.ANYONE).acceptListing(
          this.ANYONE.address,
          tokenId,
          5000
        );
      }, "Listing has not yet started");

      expect((await this.listings.sellerListings(tokenId)).seller).to.equal(
        this.OWNER.address
      );
    });
  });

  describe("setRoyaltyNumerator", function () {
    it("should set from CFO", async function () {
      await this.listingsAs(this.CFO).setRoyaltyNumerator(42);
      expect(await this.listings.royaltyNumerator()).to.equal(42);
    });

    it("should revert as ANYONE role", async function () {
      await this.toRevert(async () => {
        await this.listingsAs(this.ANYONE).setRoyaltyNumerator(42);
      }, "Only CFO");
    });

    it("should revert as any other role", async function () {
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CFO.address);
      let f = async (s: SignerWithAddress) =>
        await this.listingsAs(s).setRoyaltyNumerator(42);
      let m = "Only CFO";
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe("setListingFee", function () {
    it("should set from CFO", async function () {
      await this.listingsAs(this.CFO).setListingFee(123456);
      expect(await this.listings.listingFee()).to.equal(123456);
    });

    it("should revert as any other role", async function () {
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CFO.address);
      let f = async (s: SignerWithAddress) =>
        this.listingsAs(this.ANYONE).setListingFee(123456);
      let m = "Only CFO";
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe("getListingPrice", function () {
    it("should calculate correct prices", async function () {
      // parameter order is: time, startTimeSec,startPriceAttoSci, priceIncreases, priceSlopeNumerator
      function y(x: number, x0: number, m: number, y0: number) {
        return m * (x - x0) + y0;
      }
      let parameters = [
        { x: 10, x0: 100, y0: 0, m: 1 },
        { x: 20, x0: 0, y0: 100, m: -1 },
        { x: 40, x0: 0, y0: 3, m: 1 },
        { x: 100, x0: 10, y0: 60, m: 0.5 },
        { x: 200, x0: 10, y0: 80, m: -0.1 },
        { x: 200, x0: 10, y0: 80, m: -0.001 },
        { x: 400, x0: 10, y0: 60, m: 2 },
        { x: 1000, x0: 100, y0: 0, m: 1.3 },
        { x: 2000, x0: 100, y0: 100, m: -1.5 }, // returns zero
        { x: 4000, x0: 100, y0: 500, m: 1.1 },
      ];

      for (const p of parameters) {
        let premultiplier = 2 ** 48;
        let scaledSlope: number = Math.round(p.m * premultiplier);
        let denominator = BigNumber.from(2).pow(64);
        let priceSlopeNumerator = BigNumber.from(denominator)
          .mul(Math.abs(scaledSlope))
          .div(premultiplier);

        let expected = Math.round(y(p.x, p.x0, p.m, p.y0));

        if (expected >= 0 && p.x >= p.x0) {
          expect(
            await this.listings[
              "getListingPrice(uint64,uint64,uint256,bool,uint256)"
            ](p.x, p.x0, p.y0, p.m > 0, priceSlopeNumerator)
          ).to.equal(expected);
        } else {
          if (p.x >= p.x0) {
            expect(
              await this.listings[
                "getListingPrice(uint64,uint64,uint256,bool,uint256)"
              ](p.x, p.x0, p.y0, p.m > 0, priceSlopeNumerator)
            ).to.equal(0);
          } else {
            await this.toRevert(async () => {
              await this.listings[
                "getListingPrice(uint64,uint64,uint256,bool,uint256)"
              ](p.x, p.x0, p.y0, p.m > 0, priceSlopeNumerator);
            }, "Invalid time");
          }
        }
      }
    });
    it("should revert for time in the past", async function () {
      await this.toRevert(async () => {
        await this.listings[
          "getListingPrice(uint64,uint64,uint256,bool,uint256)"
        ](0, 100, 100, true, BigNumber.from(2).pow(64));
      }, "Invalid time");
    });

    it("should use saturating math", async function () {
      let time = BigNumber.from(2).pow(64).sub(1);
      let startTimeSec = 0;
      let startPriceAttoSci = BigNumber.from(2).pow(256).sub(1);
      let priceSlopeNumerator = BigNumber.from(2).pow(256).sub(1);

      expect(
        await this.listings[
          "getListingPrice(uint64,uint64,uint256,bool,uint256)"
        ](time, startTimeSec, startPriceAttoSci, true, priceSlopeNumerator)
      ).to.equal(BigNumber.from(2).pow(256).sub(1));

      startPriceAttoSci = BigNumber.from(100);
      expect(
        await this.listings[
          "getListingPrice(uint64,uint64,uint256,bool,uint256)"
        ](time, startTimeSec, startPriceAttoSci, false, priceSlopeNumerator)
      ).to.equal(0);
    });
  });

  describe("cancelListing", function () {
    it("should revert when paused", async function () {
      let tokenId = await this.mintNextNFT();
      await this.listingsAs(this.CEO).pause();
      await this.toRevert(async () => {
        await this.listingsAs(this.ANYONE).cancelListing(tokenId);
      }, "Pausable: paused");
    });

    it("should revert for an invalid NFT", async function () {
      await this.toRevert(async () => {
        await this.listingsAs(this.ANYONE).cancelListing(5);
      }, "Invalid NFT");
    });

    it("should cancel from Owner", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.listNFT(tokenId);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);
      let tx = await this.listingsAs(this.OWNER).cancelListing(tokenId);
      const receipt = await tx.wait();

      const iface = new ethers.utils.Interface([
        "event TransferSingle(address indexed _operator, address indexed _from,  address indexed _to, uint256 _id, uint256 _value)",
      ]);

      let TransferSingleEvent;
      for (let log of receipt.logs) {
        const parsed = iface.parseLog(log);
        if (parsed.name === "TransferSingle") {
          TransferSingleEvent = parsed;
          break;
        }
      }
      expect(TransferSingleEvent.args._id).to.equal(tokenId);
      expect(TransferSingleEvent.args._from).to.equal(this.listings.address);
      expect(TransferSingleEvent.args._to).to.equal(this.OWNER.address);
      expect(TransferSingleEvent.args._value).to.equal(1);

      expect(receipt.events?.filter((x: Event) => x.event == "ListingUpdated"))
        .to.not.be.null;
      let ListingUpdatedEvent = receipt.events.find(
        (e: any) => e.event == "ListingUpdated"
      );
      expect(ListingUpdatedEvent.args.tokenId).to.equal(tokenId);
      expect(ListingUpdatedEvent.args.seller).to.equal(
        ethers.constants.AddressZero
      );
      expect(ListingUpdatedEvent.args.endTimeSec).to.equal(0); //defaults to indefinite auction
      expect(ListingUpdatedEvent.args.startPriceAttoSci).to.equal(1000);
      expect(ListingUpdatedEvent.args.priceIncreases).to.equal(false);
      expect(ListingUpdatedEvent.args.priceSlopeNumerator).to.equal(0); //defaults to indefinite auction

      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(1);
      expect((await this.listings.sellerListings(tokenId)).seller).to.equal(
        ethers.constants.AddressZero
      );
    });

    it("should cancel from CEO", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.listNFT(tokenId);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);
      await this.listingsAs(this.CEO).cancelListing(tokenId);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(1);
      expect((await this.listings.sellerListings(tokenId)).seller).to.equal(
        ethers.constants.AddressZero
      );
    });

    it("should revert as any other role", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.listNFT(tokenId);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);

      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter(
        (s) =>
          s.address != this.CEO.address &&
          s.address != this.OWNER.address &&
          s.address != this.SUPERADMIN.address
      );
      let f = async (s: SignerWithAddress) =>
        await this.listingsAs(s).cancelListing(tokenId);
      let m = "Only SELLER, SUPERADMIN, or CEO";
      expect(await this.checkAllRoles(notAllowed, f, m));

      await this.listingsAs(this.OWNER).denySuperadminControl(true);
      await this.toRevert(async () => {
        await this.listingsAs(this.SUPERADMIN).cancelListing(tokenId);
      }, "SELLER has denied SUPERADMIN");

      // should cancel if not denied
      await this.listingsAs(this.OWNER).denySuperadminControl(false);
      await this.listingsAs(this.SUPERADMIN).cancelListing(tokenId);
    });
  });

  describe("update setListing", function () {
    it("should revert when paused", async function () {
      await this.listingsAs(this.CEO).pause();
      await this.toRevert(async () => {
        await this.listingsAs(this.OWNER).setListing(
          0,
          this.OWNER.address,
          1,
          2,
          1,
          true,
          1
        );
      }, "Pausable: paused");
    });

    it("should revert for an invalid NFT", async function () {
      await this.toRevert(async () => {
        await this.listingsAs(this.OWNER).setListing(
          5,
          this.OWNER.address,
          1,
          2,
          1,
          true,
          1
        );
      }, "Invalid NFT");
    });

    it("should restart after listing has ended, as OWNER", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      let providedListing = await this.listNFT(tokenId);
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);
      let actualListing = await this.listings.sellerListings(tokenId);
      expect(actualListing.seller).to.equal(this.OWNER.address);
      expect(actualListing.startTimeSec).to.equal(providedListing.startTimeSec);
      expect(actualListing.endTimeSec).to.equal(providedListing.endTimeSec);
      expect(actualListing.startPriceAttoSci).to.equal(
        providedListing.startPriceAttoSci
      );
      expect(actualListing.priceIncreases).to.equal(
        providedListing.priceIncreases
      );
      expect(actualListing.priceSlopeNumerator).to.equal(
        providedListing.priceSlopeNumerator
      );

      let newStartTime = providedListing.startTimeSec + 100;
      let newEndTime = 0; // change to indefinite
      let newStartPriceAttoSci = providedListing.startPriceAttoSci.add(100);
      let newSlope = 0;

      await this.listingsAs(this.OWNER).setListing(
        tokenId,
        this.OWNER.address,
        newStartTime,
        newEndTime,
        newStartPriceAttoSci,
        true,
        newSlope
      );
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);
      actualListing = await this.listings.sellerListings(tokenId);
      expect(actualListing.seller).to.equal(providedListing.seller);
      expect(actualListing.startTimeSec).to.equal(newStartTime);
      expect(actualListing.endTimeSec).to.equal(newEndTime);
      expect(actualListing.startPriceAttoSci).to.equal(newStartPriceAttoSci);
      expect(actualListing.priceIncreases).to.equal(true);
      expect(actualListing.priceSlopeNumerator).to.equal(newSlope);
    });

    it("should restart for an evergreen listing (endTimeSec == 0), as OWNER", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      let providedListing = await this.listNFT(tokenId, {
        startPriceAttoSci: "10000",
        endPriceAttoSci: "0",
        durationSec: this.INFINITE,
      });
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);
      let actualListing = await this.listings.sellerListings(tokenId);

      expect(actualListing.seller).to.equal(providedListing.seller);
      expect(actualListing.startTimeSec).to.equal(providedListing.startTimeSec);
      expect(actualListing.endTimeSec).to.equal(providedListing.endTimeSec);
      expect(actualListing.startPriceAttoSci).to.equal(
        providedListing.startPriceAttoSci
      );
      expect(actualListing.priceIncreases).to.equal(
        providedListing.priceIncreases
      );
      expect(actualListing.priceSlopeNumerator).to.equal(
        providedListing.priceSlopeNumerator
      );

      let newStartTime = providedListing.startTimeSec + 100;
      let newEndTime = newStartTime + 1;
      let newStartPriceAttoSci = providedListing.startPriceAttoSci.add(1123400);
      let newSlope = 0;

      await this.listingsAs(this.OWNER).setListing(
        tokenId,
        this.OWNER.address,
        newStartTime,
        newEndTime,
        newStartPriceAttoSci,
        true,
        newSlope
      );
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);
      actualListing = await this.listings.sellerListings(tokenId);
      expect(actualListing.seller).to.equal(providedListing.seller);
      expect(actualListing.startTimeSec).to.equal(newStartTime);
      expect(actualListing.endTimeSec).to.equal(newEndTime);
      expect(actualListing.startPriceAttoSci).to.equal(newStartPriceAttoSci);
      expect(actualListing.priceIncreases).to.equal(true);
      expect(actualListing.priceSlopeNumerator).to.equal(newSlope);
    });

    it("should revert from any other role", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      await this.listNFT(tokenId);
      expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);

      await this.listingsAs(this.OWNER).denySuperadminControl(true);

      await this.toRevert(async () => {
        await this.listingsAs(this.SUPERADMIN).setListing(
          tokenId,
          this.OWNER.address,
          1,
          2,
          1,
          true,
          1
        );
      }, "SELLER has denied SUPERADMIN");

      await this.listingsAs(this.OWNER).denySuperadminControl(false);

      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter(
        (s) =>
          s.address != this.OWNER.address &&
          s.address != this.SUPERADMIN.address
      );
      let f = async (s: SignerWithAddress) =>
        await this.listingsAs(s).setListing(
          tokenId,
          this.OWNER.address,
          0,
          0,
          100,
          false,
          10000000
        );
      let m = "Only SELLER or SUPERADMIN";
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe("Pausable", function () {
    it("should pause and unpause from CEO", async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );

      await this.listingsAs(this.CEO).pause();
      await this.toRevert(async () => {
        await this.listNFT(tokenId, {
          startPriceAttoSci: "1000",
          endPriceAttoSci: "1500", // ignored
          durationSec: this.INFINITE,
        });
      }, "Pausable: paused");

      await this.listingsAs(this.CEO).unpause();
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      this.listNFT(tokenId, {
        startPriceAttoSci: "1000",
        endPriceAttoSci: "1500", // ignored
        durationSec: this.INFINITE,
      });
    });

    it("should revert from any other role", async function () {
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CEO.address);
      let f = async (s: SignerWithAddress) => await this.listingsAs(s).pause();
      let m = "Only CEO";
      expect(await this.checkAllRoles(notAllowed, f, m));

      await this.listingsAs(this.CEO).pause();

      f = async (s: SignerWithAddress) => await this.listingsAs(s).unpause();
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe("cancelAllListings", function () {
    this.timeout(10000);

    it("should revert if not paused", async function () {
      await this.toRevert(async () => {
        await this.listingsAs(this.CEO).cancelAllListings(50);
      }, "Pausable: not paused");
    });

    it("should cancel 100 listings as CEO", async function () {
      expect(await this.listings.nextListedTokenId()).to.be.equal(0);

      // mint 100 NFTs
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      for (let i = 0; i < 100; i++) {
        let tokenId = await this.mintNextNFT();
        await this.listNFT(tokenId);
        expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);
      }

      let N1 = await this.tokens.FIRST_NFT();
      // cancel two
      await this.listingsAs(this.OWNER).cancelListing(N1);
      expect((await this.listings.sellerListings(N1)).seller).to.equal(
        ethers.constants.AddressZero
      );
      expect(await this.balanceNFT(this.listings, N1)).to.equal(0);
      expect(await this.balanceNFT(this.OWNER, N1)).to.equal(1);

      await this.listingsAs(this.OWNER).cancelListing(N1 + 1);
      expect((await this.listings.sellerListings(N1 + 1)).seller).to.equal(
        ethers.constants.AddressZero
      );
      expect(await this.balanceNFT(this.listings, N1 + 1)).to.equal(0);
      expect(await this.balanceNFT(this.OWNER, N1 + 1)).to.equal(1);

      // withdraw 50 NFTs -- since we canceled two, expect nextIndex 52
      await this.listingsAs(this.CEO).pause();
      await this.listingsAs(this.CEO).cancelAllListings(50);
      expect(await this.listings.nextListedTokenId()).to.be.equal(52);

      for (let tokenId = N1; tokenId < N1 + 100; tokenId++) {
        expect(await this.balanceNFT(this.listings, tokenId)).to.equal(
          tokenId < N1 + 52 ? 0 : 1
        );
      }

      expect((await this.listings.sellerListings(N1 + 20)).seller).to.equal(
        ethers.constants.AddressZero
      );

      // withdraw 10 NFTs -- since we canceled two, expect nextIndex 52
      await this.listingsAs(this.CEO).cancelAllListings(10);
      expect(await this.listings.nextListedTokenId()).to.be.equal(62);
      for (let tokenId = N1; tokenId < N1 + 100; tokenId++) {
        expect(await this.balanceNFT(this.listings, tokenId)).to.equal(
          tokenId < N1 + 62 ? 0 : 1
        );
      }

      // withdraw the remainder (exits early without complaint)
      expect(await this.listingsAs(this.CEO).cancelAllListings(50));
      expect(await this.listings.nextListedTokenId()).to.be.equal(100);

      // check that all the listings were canceled
      for (let tokenId = N1; tokenId < N1 + 100; tokenId++) {
        expect(await this.balanceNFT(this.listings, tokenId)).to.equal(0);
        expect((await this.listings.sellerListings(tokenId)).seller).to.equal(
          ethers.constants.AddressZero
        );
      }
    }).timeout(20000);

    it("should revert from any other role", async function () {
      await this.listingsAs(this.CEO).pause();
      expect(await this.listings.nextListedTokenId()).to.be.equal(0);
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CEO.address);
      let f = async (s: SignerWithAddress) =>
        await this.listingsAs(s).cancelAllListings(1);
      let m = "Only CEO";
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe("withdraw fees", function () {
    it("should withdraw fees as CFO", async function () {
      let balanceBefore = await this.ANYONE.getBalance();
      // mint 5 NFTs
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      for (let i = 0; i < 5; i++) {
        let tokenId = await this.mintNextNFT();
        await this.listNFT(tokenId);
        expect(await this.balanceNFT(this.listings, tokenId)).to.equal(1);
      }
      let total_fees = (await this.listings.listingFee()).toNumber() * 5;
      await this.listingsAs(this.CFO).withdraw(this.ANYONE.address, total_fees);
      expect(await this.ANYONE.getBalance()).to.equal(
        balanceBefore.add(total_fees)
      );
    });

    it("should revert from any other role", async function () {
      await this.tokensAs(this.OWNER).setApprovalForAll(
        this.listings.address,
        true
      );
      let tokenId = await this.mintNextNFT();
      await this.listNFT(tokenId);
      let one_fee = (await this.listings.listingFee()).toNumber();

      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CFO.address);
      let f = async (s: SignerWithAddress) =>
        await this.listingsAs(s).withdraw(this.ANYONE.address, one_fee);
      let m = "Only CFO";
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });
});

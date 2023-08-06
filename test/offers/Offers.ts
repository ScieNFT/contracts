import { expect } from 'chai';
import { keccak256 } from '@ethersproject/keccak256';
import { toUtf8Bytes } from '@ethersproject/strings';
import { time } from '@nomicfoundation/hardhat-network-helpers';
// @ts-ignore
import { ethers } from 'hardhat';
import { randomBytes } from 'crypto';

import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployOffersFixture } from './Offers.fixture';
import { BigNumber, Event } from 'ethers';

// arbitrary HASH values
const DATA_HASH = keccak256(toUtf8Bytes('DATA_HASH'));
const ERRATA_HASH = keccak256(toUtf8Bytes('ERRATA_HASH'));

describe('Offers Contract', function () {
  beforeEach(async function () {
    const { CEO, CFO, SUPERADMIN, OWNER, BRIDGE, ANYONE, EVERYONE, tokens, offers } =
      await loadFixture(deployOffersFixture);
    this.tokens = tokens;
    this.offers = offers;
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
              let matches = e.message.match(/'([^']*)'/);
              if (!matches || matches[1] !== expectedRejection) {
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

    this.offersAs = (signer: SignerWithAddress) =>
      new ethers.Contract(offers.address, this.offers.interface, signer);

    this.balanceSCI = (s: SignerWithAddress): Promise<number> =>
      this.tokens['balanceOf(address,uint256)'](s.address, this.tokens.SCI()).then((b: BigNumber) =>
        b.toNumber()
      );

    this.creditSCI = async (s: SignerWithAddress, amount: bigint) => {
      let fee = 12345;
      await this.tokensAs(this.CFO).setMiningFee(fee);
      // guess a valid solution using proof of work
      let solution = randomBytes(32);
      let done = false;
      while (!done) {
        solution = randomBytes(32);
        done = await this.tokens.isCorrect(solution);
      }

      let lastTime = BigNumber.from(await time.latest());
      let interval = BigNumber.from(await this.tokensAs(this.CFO).miningIntervalSeconds());
      time.setNextBlockTimestamp(lastTime.add(interval).add(1));
      await this.tokens.mineSCI(solution, this.CFO.address, {
        value: BigNumber.from(fee).toString(),
      });

      await this.tokensAs(this.CFO).transfer(s.address, amount);
    };

    this.balanceNFT = (s: SignerWithAddress, tokenId: number): Promise<number> =>
      this.tokens['balanceOf(address,uint256)'](s.address, tokenId).then((b: BigNumber) =>
        b.toNumber()
      );

    let _nextNFTIndex: number = await this.tokens.FIRST_NFT();

    this.mintNextNFT = (s = OWNER): Promise<number> =>
      this.tokens.mintingFee().then((fee: BigNumber) => {
        return this.tokensAs(s)
          ['mintNFT(bytes32)'](DATA_HASH, {
            value: fee.toString(),
          })
          .then((_: any) => {
            return _nextNFTIndex++;
          });
      });

    this.getOffer = async (s: SignerWithAddress, tokenId: number) => {
      let data = await this.offers.buyerOffers(await this.offers.encodeKey(s.address, tokenId));
      return [data.buyer, data.endTimeSec.toNumber(), data.price.toNumber()];
    };
  });

  describe('Deployment', function () {
    it('should connect to the Tokens contract', async function () {
      let tokensAddress = await this.offers.tokens();
      expect(tokensAddress).to.equal(this.tokens.address);
      expect(await this.tokens.hasRole(await this.tokens.MARKETPLACE_ROLE(), this.offers.address))
        .to.be.true;
    });

    it('should set parameters to values in env', async function () {
      let envListingFee: string | undefined = process.env.DEFAULT_LISTING_FEE_GAS;
      const listingFee = BigNumber.from(envListingFee);
      expect(await this.offers.offerFee()).to.be.equal(listingFee);

      let envRoyaltyNumerator: string | undefined = process.env.DEFAULT_ROYALTY_NUMERATOR;
      const royaltyNumerator = BigNumber.from(envRoyaltyNumerator);
      expect(await this.offers.royaltyNumerator()).to.be.equal(royaltyNumerator);
    });

    it('should have the CEO_ROLE value match the AccessControl default of 0x0', async function () {
      expect(await this.offers.CEO_ROLE()).to.equal(
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      );
    });

    it('should grant the CEO role to contract deployment sender', async function () {
      expect(await this.offers.hasRole(await this.offers.CEO_ROLE(), this.CEO.address)).to.be.true;
    });

    it('should grant the CFO role in the fixture', async function () {
      expect(await this.offers.hasRole(await this.offers.CFO_ROLE(), this.CFO.address)).to.be.true;
    });

    it('should support all expected ERC165 interfaces', async function () {
      function toBytes4(s: string) {
        var b4 = new Uint8Array(4);
        for (var i = 0; i < 4; i++) {
          b4[i] = parseInt(s.substring(i * 2, (i + 1) * 2), 16);
        }
        return b4;
      }
      const IID_IACCESS_CONTROL = toBytes4('7965db0b'); // type(IAccessControl).interfaceId
      const IID_IERC1155_RECEIVER = toBytes4('4e2312e0'); // type(IERC1155Receiver).interfaceId;
      const IID_IERC165 = toBytes4('01ffc9a7'); // type(IERC165).interfaceId
      expect(await this.offers.supportsInterface(IID_IACCESS_CONTROL)).to.be.true;
      expect(await this.offers.supportsInterface(IID_IERC1155_RECEIVER)).to.be.true;
      expect(await this.offers.supportsInterface(IID_IERC165)).to.be.true;
    });

    it('should revert transfers of gas tokens to contract address', async function () {
      await this.toRevert(async () => {
        await this.CEO.sendTransaction({ to: this.offers.address, value: 100 });
      }, 'receive() reverts');
    });

    it('should revert on fallback', async function () {
      const nonExistentFuncSignature = 'nonExistentFunc(uint256,uint256)';
      const fakeDemoContract = new ethers.Contract(
        this.offers.address,
        [...this.offers.interface.fragments, `function ${nonExistentFuncSignature}`],
        this.CEO
      );
      await this.toRevert(async () => {
        await fakeDemoContract[nonExistentFuncSignature](8, 9);
      }, 'fallback() reverts');
    });
  });

  describe('setOffer', function () {
    it('should revert from all roles when trying to create an bid for SCI tokens', async function () {
      let notAllowed = await ethers.getSigners();
      let f = async (s: SignerWithAddress) =>
        this.offersAs(s).setOffer(0, s.address, 0, 1000, {
          value: (await this.offers.offerFee()).toString(),
        });
      let m = 'Invalid NFT';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });

    it('should revert when offering zero', async function () {
      let tokenId = await this.mintNextNFT();

      let amount = 0;
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      let now = BigNumber.from(await time.latest());
      time.setNextBlockTimestamp(now.add(1));
      let endTimeSec = now.add(100);

      await this.toRevert(async () => {
        await this.offersAs(this.ANYONE).setOffer(
          tokenId,
          this.ANYONE.address,
          endTimeSec,
          amount,
          {
            value: (await this.offers.offerFee()).toString(),
          }
        );
      }, 'Invalid price');
    });

    it('should revert when NFT is offchain', async function () {
      let tokenId = await this.mintNextNFT();
      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      expect(await this.tokens.isBridged(tokenId)).to.equal(true);

      let amount = 100;
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      let now = BigNumber.from(await time.latest());
      time.setNextBlockTimestamp(now.add(1));
      let endTimeSec = now.add(100);

      await this.toRevert(async () => {
        await this.offersAs(this.ANYONE).setOffer(
          tokenId,
          this.ANYONE.address,
          endTimeSec,
          amount,
          {
            value: (await this.offers.offerFee()).toString(),
          }
        );
      }, 'NFT is bridged');
    });

    it('should make offer for an existing NFT, with correct fee payment', async function () {
      let tokenId = await this.mintNextNFT();
      let endTimeSec = 0;
      let amount = 100;
      await this.creditSCI(this.ANYONE, amount * 2); // we will buy two NFTs!
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount * 2);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      let listingFee = 1234;
      await this.offersAs(this.CFO).setOfferFee(listingFee);

      await this.toRevert(async () => {
        await this.offersAs(this.SUPERADMIN).setOffer(
          tokenId,
          this.ANYONE.address,
          endTimeSec,
          amount,
          {
            value: (await this.offers.offerFee()).toString(),
          }
        );
      }, 'Wrong offer fee');

      await this.offersAs(this.SUPERADMIN).setOffer(
        tokenId,
        this.ANYONE.address,
        endTimeSec,
        amount,
        {
          value: ethers.BigNumber.from(0).toString(),
        }
      );
      expect(await this.getOffer(this.ANYONE, tokenId)).deep.equal([
        this.ANYONE.address,
        endTimeSec,
        amount,
      ]);

      await this.toRevert(async () => {
        await this.offersAs(this.CFO).withdraw(this.OWNER.address, listingFee);
      }, 'Value exceeds balance');

      // do it again, but pay a fee this time

      tokenId = await this.mintNextNFT(); // otherwise we are updating and expecting not to pay

      let tx = await this.offersAs(this.ANYONE).setOffer(
        tokenId,
        this.ANYONE.address,
        endTimeSec,
        amount,
        {
          value: (await this.offers.offerFee()).toString(),
        }
      );
      const receipt = await tx.wait();

      const iface = new ethers.utils.Interface([
        'event TransferSingle(address indexed _operator, address indexed _from,  address indexed _to, uint256 _id, uint256 _value)',
      ]);

      let TransferSingleEvent: any;
      for (let log of receipt.logs) {
        const parsed = iface.parseLog(log);
        if (parsed.name === 'TransferSingle') {
          TransferSingleEvent = parsed;
          break;
        }
      }
      expect(TransferSingleEvent.args._id).to.equal(await this.tokens.SCI());
      expect(TransferSingleEvent.args._from).to.equal(this.ANYONE.address);
      expect(TransferSingleEvent.args._to).to.equal(this.offers.address);
      expect(TransferSingleEvent.args._value).to.equal(amount);

      expect(receipt.events?.filter((x: Event) => x.event == 'OfferUpdated')).to.not.be.null;
      let offerUpdatedEvent = receipt.events.find((e: any) => e.event == 'OfferUpdated');
      expect(offerUpdatedEvent.args.tokenId).to.equal(tokenId);
      expect(offerUpdatedEvent.args.buyer).to.equal(this.ANYONE.address);
      expect(offerUpdatedEvent.args.endTimeSec).to.equal(endTimeSec);
      expect(offerUpdatedEvent.args.price).to.equal(amount);

      // check that the correct offer fee was paid (contract is back to original gas)
      let ownerGasBefore = await this.OWNER.getBalance(); // in gas tokens
      await this.offersAs(this.CFO).withdraw(this.OWNER.address, listingFee);
      expect(await this.OWNER.getBalance()).to.equal(ownerGasBefore.add(listingFee));
      expect(await this.offers.provider.getBalance(this.offers.address)).to.equal(0);
    });

    it('should revert without fee payment', async function () {
      let tokenId = await this.mintNextNFT();

      let amount = 100;
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      let now = BigNumber.from(await time.latest());
      time.setNextBlockTimestamp(now.add(1));
      let endTimeSec = now.add(100);

      await this.toRevert(async () => {
        await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, endTimeSec, amount);
      }, 'Wrong offer fee');
    });

    it('should allow without fee payment as SUPERADMIN', async function () {
      let tokenId = await this.mintNextNFT();

      let amount = 100;
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      let now = BigNumber.from(await time.latest());
      time.setNextBlockTimestamp(now.add(1));
      let endTimeSec = now.add(100);

      await this.toRevert(async () => {
        await this.offersAs(this.SUPERADMIN).setOffer(
          tokenId,
          this.ANYONE.address,
          endTimeSec,
          amount,
          {
            value: (await this.offers.offerFee()).toString(),
          }
        );
      }, 'Wrong offer fee');

      await this.offersAs(this.SUPERADMIN).setOffer(
        tokenId,
        this.ANYONE.address,
        endTimeSec,
        amount
      );

      await this.offersAs(this.ANYONE).denySuperadminControl(true);
      await this.toRevert(async () => {
        await this.offersAs(this.SUPERADMIN).setOffer(
          tokenId,
          this.ANYONE.address,
          endTimeSec,
          amount
        );
      }, 'BUYER has denied SUPERADMIN');
    });

    it('should revert if end time is in the past', async function () {
      let tokenId = await this.mintNextNFT();

      let amount = 100;
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      let now = BigNumber.from(await time.latest());
      time.setNextBlockTimestamp(now.add(1));
      let endTimeSec = now.sub(100);

      await this.toRevert(async () => {
        await this.offersAs(this.ANYONE).setOffer(
          tokenId,
          this.ANYONE.address,
          endTimeSec,
          amount,
          {
            value: (await this.offers.offerFee()).toString(),
          }
        );
      }, 'Invalid end time');
    });

    it('should revert without attempted overpayment of the fee', async function () {
      let tokenId = await this.mintNextNFT();

      let amount = 100;
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      let now = BigNumber.from(await time.latest());
      time.setNextBlockTimestamp(now.add(1));
      let endTimeSec = now.add(100);

      await this.toRevert(async () => {
        await this.offersAs(this.ANYONE).setOffer(
          tokenId,
          this.ANYONE.address,
          endTimeSec,
          amount,
          {
            value: ((await this.offers.offerFee()) + 10).toString(),
          }
        );
      }, 'Wrong offer fee');
    });

    it('should update an existing bid when called by the same signer', async function () {
      let tokenId = await this.mintNextNFT();

      let amount = 100;
      await this.creditSCI(this.ANYONE, 10 * amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(10 * amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      let now = BigNumber.from(await time.latest());
      time.setNextBlockTimestamp(now.add(1));
      let endTimeSec = now.add(100);

      await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, endTimeSec, amount, {
        value: (await this.offers.offerFee()).toString(),
      });
      expect(await this.getOffer(this.ANYONE, tokenId)).deep.equal([
        this.ANYONE.address,
        endTimeSec,
        amount,
      ]);

      // increase the offer
      let balanceBefore = await this.balanceSCI(this.ANYONE);
      let tx = await this.offersAs(this.ANYONE).setOffer(
        tokenId,
        this.ANYONE.address,
        endTimeSec.add(10),
        amount + 10,
        {
          value: 0, //updates do not require fee
        }
      );
      let receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'OfferUpdated')).to.not.be.null;
      let offerUpdatedEvent = receipt.events.find((e: any) => e.event == 'OfferUpdated');
      expect(offerUpdatedEvent.args.tokenId).to.equal(tokenId);
      expect(offerUpdatedEvent.args.buyer).to.equal(this.ANYONE.address);
      expect(offerUpdatedEvent.args.endTimeSec).to.equal(endTimeSec.add(10));
      expect(offerUpdatedEvent.args.price).to.equal(amount + 10);

      expect(await this.getOffer(this.ANYONE, tokenId)).deep.equal([
        this.ANYONE.address,
        endTimeSec.add(10),
        amount + 10,
      ]);

      let balanceAfter = await this.balanceSCI(this.ANYONE);
      expect(balanceAfter - balanceBefore).to.be.equal(-10); // bid increased by 10

      // decrease the offer
      balanceBefore = await this.balanceSCI(this.ANYONE);
      await this.offersAs(this.ANYONE).setOffer(
        tokenId,
        this.ANYONE.address,
        endTimeSec.add(20),
        amount - 10,
        {
          value: 0, //updates do not require fee
        }
      );
      expect(await this.getOffer(this.ANYONE, tokenId)).deep.equal([
        this.ANYONE.address,
        endTimeSec.add(20),
        amount - 10,
      ]);
      balanceAfter = await this.balanceSCI(this.ANYONE);
      expect(balanceAfter - balanceBefore).to.be.equal(20); // bid decreased by 20
    });

    it('should revert updating an offer incorrectly', async function () {
      let tokenId = await this.mintNextNFT();
      let amount = 100;
      await this.creditSCI(this.ANYONE, 10 * amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(10 * amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      let now = BigNumber.from(await time.latest());
      time.setNextBlockTimestamp(now.add(1));
      let endTimeSec = now.add(100);
      await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, endTimeSec, amount, {
        value: (await this.offers.offerFee()).toString(),
      });
      expect(await this.getOffer(this.ANYONE, tokenId)).deep.equal([
        this.ANYONE.address,
        endTimeSec,
        amount,
      ]);

      // no offer fee is required to update an offer
      await this.toRevert(async () => {
        await this.offersAs(this.ANYONE).setOffer(
          tokenId,
          this.ANYONE.address,
          endTimeSec.add(100),
          amount + 1,
          {
            value: (await this.offers.offerFee()).toString(),
          }
        );
      }, 'Wrong offer fee');

      // no address is approved as an agent yet
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter(
        (s) => s.address != this.ANYONE.address && s.address != this.SUPERADMIN.address
      );
      let f = async (s: SignerWithAddress) =>
        this.offersAs(s).setOffer(tokenId, this.ANYONE.address, endTimeSec.add(100), amount + 1);
      let m = 'Only BUYER or SUPERADMIN';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });

    it('should allow two signers to bid on the same NFT', async function () {
      let tokenId = await this.mintNextNFT();
      let now = BigNumber.from(await time.latest());
      time.setNextBlockTimestamp(now.add(1));

      let endTimeSec = (await time.latest()) + 10000;
      let amount = 1000;
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      await this.creditSCI(this.CEO, amount);
      expect(await this.balanceSCI(this.CEO)).to.equal(amount);
      await this.tokensAs(this.CEO).setApprovalForAll(this.offers.address, true);

      await this.offersAs(this.ANYONE).setOffer(
        tokenId,
        this.ANYONE.address,
        endTimeSec,
        amount / 2,
        {
          value: (await this.offers.offerFee()).toString(),
        }
      );

      expect(await this.getOffer(this.ANYONE, tokenId)).deep.equal([
        this.ANYONE.address,
        endTimeSec,
        amount / 2,
      ]);

      await this.offersAs(this.CEO).setOffer(
        tokenId,
        this.CEO.address,
        endTimeSec,
        amount / 2 + 100,
        {
          value: (await this.offers.offerFee()).toString(),
        }
      );
      expect(await this.getOffer(this.CEO, tokenId)).deep.equal([
        this.CEO.address,
        endTimeSec,
        amount / 2 + 100,
      ]);
    });

    it('should revert when bidding on NFT that is not minted', async function () {
      let tokenId = await this.tokens.FIRST_NFT();
      let now = BigNumber.from(await time.latest());
      time.setNextBlockTimestamp(now.add(1));
      let endTimeSec = (await time.latest()) + 10;
      let amount = 100;

      await this.toRevert(async () => {
        await this.offersAs(this.ANYONE).setOffer(
          tokenId,
          this.ANYONE.address,
          endTimeSec,
          amount,
          {
            value: (await this.offers.offerFee()).toString(),
          }
        );
      }, 'Invalid NFT');
    });

    it('should revert when bidding on an NFT that is blocklisted', async function () {
      let tokenId = await this.mintNextNFT();
      let endTimeSec = (await time.latest()) + 10;
      let amount = 100;
      await this.tokensAs(this.SUPERADMIN).blocklist(tokenId, true);

      await this.toRevert(async () => {
        await this.offersAs(this.ANYONE).setOffer(
          tokenId,
          this.ANYONE.address,
          endTimeSec,
          amount,
          {
            value: (await this.offers.offerFee()).toString(),
          }
        );
      }, 'NFT is blocklisted');
    });
  });

  describe('acceptOffer', function () {
    it('should accept a valid offer and transfer tokens', async function () {
      let tokenId = await this.mintNextNFT();
      let endTimeSec = 0; // non-expiring offer
      let amount = 100;
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(1);
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, endTimeSec, amount, {
        value: (await this.offers.offerFee()).toString(),
      });
      // have an agent accept the offer on behalf of this.OWNER
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(1);
      await this.tokensAs(this.OWNER).setApprovalForAll(this.offers.address, true);

      // this is a nonexpiring offer so blocktime should not matter
      let blockTime = (await time.latest()) + 1000;
      await time.setNextBlockTimestamp(blockTime);

      let tx = await this.offersAs(this.SUPERADMIN).acceptOffer(
        this.OWNER.address,
        tokenId,
        this.ANYONE.address,
        amount
      );
      const receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'OfferUpdated')).to.not.be.null;
      let offerUpdatedEvent = receipt.events.find((e: any) => e.event == 'OfferUpdated');
      expect(offerUpdatedEvent.args.tokenId).to.equal(tokenId);
      expect(offerUpdatedEvent.args.buyer).to.equal(ethers.constants.AddressZero);
      expect(offerUpdatedEvent.args.endTimeSec).to.equal(endTimeSec);
      expect(offerUpdatedEvent.args.price).to.equal(amount);
    });

    it('should accept a valid offer and transfer tokens without FULL_BENEFIT flag', async function () {
      let tokenId = await this.mintNextNFT();
      let endTimeSec = (await time.latest()) + 10000000; // expires but far in the future
      let amount = 10;
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(1);

      await this.tokensAs(this.OWNER).setBeneficiary(tokenId, this.SUPERADMIN.address);
      let beneficiaryBalanceBefore = await this.balanceSCI(this.SUPERADMIN);

      expect(await this.tokens.isFullBenefit(tokenId)).to.equal(true);
      await this.tokensAs(this.OWNER).setFullBenefitFlag(tokenId, false);
      expect(await this.tokens.isFullBenefit(tokenId)).to.equal(false);

      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, endTimeSec, amount, {
        value: (await this.offers.offerFee()).toString(),
      });

      // make the math work out to integers
      let tx = await this.offersAs(this.CFO).setRoyaltyNumerator(64);
      const receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'RoyaltyNumeratorSet')).to.not.be.null;
      expect(receipt.events[0].args.royaltyNumerator).to.equal(64);

      let numerator = await this.offers.royaltyNumerator();

      // this.OWNER now accepts the offer
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(1);
      expect(await this.balanceNFT(this.ANYONE, tokenId)).to.equal(0);
      expect(await this.balanceSCI(this.OWNER)).to.equal(0);

      let balanceBefore = await this.balanceSCI(this.OWNER);
      await this.tokensAs(this.OWNER).setApprovalForAll(this.offers.address, true);

      expect(await this.tokens.isFullBenefit(tokenId)).to.equal(false);
      // transfers tokens (use SUPERADMIN)
      await this.offersAs(this.SUPERADMIN).acceptOffer(
        this.OWNER.address,
        tokenId,
        this.ANYONE.address,
        amount
      );

      let beneficiaryBalanceAfter = await this.balanceSCI(this.SUPERADMIN);
      let balanceAfter = await this.balanceSCI(this.OWNER);
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(0);
      expect(await this.balanceNFT(this.ANYONE, tokenId)).to.equal(1);

      expect(beneficiaryBalanceAfter - beneficiaryBalanceBefore).to.be.equal(
        (amount * numerator) >> 8
      );
      expect(balanceAfter - balanceBefore).to.be.equal(amount - ((amount * numerator) >> 8));
    });

    it('should revert accepting an offer incorrectly', async function () {
      let tokenId = await this.mintNextNFT();
      let endTimeSec = 0; // non-expiring offer
      let amount = 100;
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(1);
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, endTimeSec, amount, {
        value: (await this.offers.offerFee()).toString(),
      });
      // this.OWNER now accepts the offer
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(1);
      await this.tokensAs(this.OWNER).setApprovalForAll(this.offers.address, true);

      // wrong role
      await this.toRevert(async () => {
        await this.offersAs(this.CEO).acceptOffer(
          this.OWNER.address,
          tokenId,
          this.ANYONE.address,
          amount
        );
      }, 'Only SELLER or SUPERADMIN');

      // denial
      await this.offersAs(this.OWNER).denySuperadminControl(true);
      await this.toRevert(async () => {
        await this.offersAs(this.SUPERADMIN).acceptOffer(
          this.OWNER.address,
          tokenId,
          this.ANYONE.address,
          amount
        );
      }, 'SELLER has denied SUPERADMIN');

      await this.toRevert(async () => {
        await this.offersAs(this.OWNER).acceptOffer(
          this.OWNER.address,
          tokenId,
          this.ANYONE.address,
          amount + 1
        );
      }, 'Wrong price');

      // also revert if we have the wrong address
      await this.toRevert(async () => {
        await this.offersAs(this.OWNER).acceptOffer(
          this.OWNER.address,
          tokenId,
          this.CEO.address,
          amount
        );
      }, 'Invalid offer');

      // update the offer to expire soon
      endTimeSec = (await time.latest()) + 1000;
      await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, endTimeSec, amount);
      expect(await this.getOffer(this.ANYONE, tokenId)).deep.equal([
        this.ANYONE.address,
        endTimeSec,
        amount,
      ]);

      // advance time until the offer has expired
      await time.setNextBlockTimestamp(endTimeSec + 1);

      // can't accept
      await this.toRevert(async () => {
        await this.offersAs(this.OWNER).acceptOffer(
          this.OWNER.address,
          tokenId,
          this.ANYONE.address,
          amount
        );
      }, 'Offer has expired');
    });

    it('should revert if paused', async function () {
      let tokenId = await this.mintNextNFT();
      let endTimeSec = 0; // non-expiring offer
      let amount = 100;
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(1);
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, endTimeSec, amount, {
        value: (await this.offers.offerFee()).toString(),
      });
      // this.OWNER now accepts the offer
      expect(await this.balanceNFT(this.OWNER, tokenId)).to.equal(1);
      await this.tokensAs(this.OWNER).setApprovalForAll(this.offers.address, true);

      await this.offersAs(this.CEO).pause();

      await this.toRevert(async () => {
        await this.offersAs(this.OWNER).acceptOffer(
          this.OWNER.address,
          tokenId,
          this.ANYONE.address,
          amount
        );
      }, 'Pausable: paused');
    });
  });

  describe('setRoyaltyNumerator', function () {
    it('should set from CFO', async function () {
      let tx = await this.offersAs(this.CFO).setRoyaltyNumerator(42);
      const receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'RoyaltyNumeratorSet')).to.not.be.null;
      expect(receipt.events[0].args.royaltyNumerator).to.equal(42);

      expect(await this.offers.royaltyNumerator()).to.equal(42);
    });

    it('should revert as ANYONE role', async function () {
      await this.toRevert(async () => {
        await this.offersAs(this.ANYONE).setRoyaltyNumerator(42);
      }, 'Only CFO');
    });

    it('should revert as any other role', async function () {
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CFO.address);
      let f = async (s: SignerWithAddress) => await this.offersAs(s).setRoyaltyNumerator(42);
      let m = 'Only CFO';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('setOfferFee', function () {
    it('should set from CFO', async function () {
      let fee = 92348;

      let tx = await this.offersAs(this.CFO).setOfferFee(fee);
      const receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'OfferFeeSet')).to.not.be.null;
      expect(receipt.events[0].args.offerFee).to.equal(fee);

      expect(await this.offers.offerFee()).to.equal(fee);
    });

    it('should revert as any other role', async function () {
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CFO.address);
      let f = async (s: SignerWithAddress) => this.offersAs(this.ANYONE).setOfferFee(123456);
      let m = 'Only CFO';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('cancelOffer', function () {
    it('should revert if paused', async function () {
      let tokenId = await this.mintNextNFT();
      let endTimeSec = 0;
      let amount = 100;
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, endTimeSec, amount, {
        value: (await this.offers.offerFee()).toString(),
      });
      expect(await this.getOffer(this.ANYONE, tokenId)).deep.equal([
        this.ANYONE.address,
        endTimeSec,
        amount,
      ]);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(0);

      await this.offersAs(this.ANYONE).denySuperadminControl(true);
      await this.toRevert(async () => {
        await this.offersAs(this.SUPERADMIN).cancelOffer(this.ANYONE.address, tokenId);
      }, 'BUYER has denied SUPERADMIN');

      await this.offersAs(this.CEO).pause();

      await this.toRevert(async () => {
        await this.offersAs(this.ANYONE).cancelOffer(this.ANYONE.address, tokenId);
      }, 'Pausable: paused');

      await this.offersAs(this.CEO).unpause();
      await this.offersAs(this.ANYONE).denySuperadminControl(false);
      await this.offersAs(this.SUPERADMIN).cancelOffer(this.ANYONE.address, tokenId);
    });

    it('should cancel and return staked SCI tokens', async function () {
      let tokenId = await this.mintNextNFT();
      let endTimeSec = 0;
      let amount = 100;
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, endTimeSec, amount, {
        value: (await this.offers.offerFee()).toString(),
      });
      expect(await this.getOffer(this.ANYONE, tokenId)).deep.equal([
        this.ANYONE.address,
        endTimeSec,
        amount,
      ]);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(0);

      let tx = await this.offersAs(this.ANYONE).cancelOffer(this.ANYONE.address, tokenId);
      const receipt = await tx.wait();

      expect(receipt.events?.filter((x: Event) => x.event == 'OfferUpdated')).to.not.be.null;

      let offerUpdatedEvent = receipt.events.find((e: any) => e.event == 'OfferUpdated');
      expect(offerUpdatedEvent.args.tokenId).to.equal(tokenId);
      expect(offerUpdatedEvent.args.buyer).to.equal(ethers.constants.AddressZero);
      expect(offerUpdatedEvent.args.endTimeSec).to.equal(endTimeSec);
      expect(offerUpdatedEvent.args.price).to.equal(amount);

      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
    });

    it('should cancel as the CEO', async function () {
      let tokenId = await this.mintNextNFT();
      let endTimeSec = 0;
      let amount = 8;
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, endTimeSec, amount, {
        value: (await this.offers.offerFee()).toString(),
      });
      expect(await this.getOffer(this.ANYONE, tokenId)).deep.equal([
        this.ANYONE.address,
        endTimeSec,
        amount,
      ]);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(0);
      await this.offersAs(this.CEO).cancelOffer(this.ANYONE.address, tokenId);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
    });

    it('should revert if not our offer', async function () {
      let tokenId = await this.mintNextNFT();
      let amount = 100;
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      let now = BigNumber.from(await time.latest());
      time.setNextBlockTimestamp(now.add(1));
      let endTimeSec = now.add(100);

      await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, endTimeSec, amount, {
        value: (await this.offers.offerFee()).toString(),
      });

      expect(await this.balanceSCI(this.ANYONE)).to.equal(0);

      await this.toRevert(async () => {
        await this.offersAs(this.CEO).cancelOffer(this.CEO.address, tokenId);
      }, 'Invalid offer');

      await this.toRevert(async () => {
        await this.offersAs(this.CFO).cancelOffer(this.ANYONE.address, tokenId);
      }, 'Only BUYER, SUPERADMIN, or CEO');

      await this.offersAs(this.ANYONE).denySuperadminControl(true);
      await this.toRevert(async () => {
        await this.offersAs(this.SUPERADMIN).cancelOffer(this.ANYONE.address, tokenId);
      }, 'BUYER has denied SUPERADMIN');
    });
  });

  describe('Pausable', function () {
    it('should pause and unpause from CEO', async function () {
      let tokenId = await this.mintNextNFT();

      let amount = 100;
      await this.creditSCI(this.ANYONE, amount);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(amount);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);

      let tx = await this.offersAs(this.CEO).pause();
      const receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'Paused')).to.not.be.null;
      expect(receipt.events[0].args.account).to.equal(this.CEO.address);

      let endTimeSec = (await time.latest()) + 10;
      await this.toRevert(async () => {
        await this.offersAs(this.ANYONE).setOffer(
          tokenId,
          this.ANYONE.address,
          endTimeSec,
          amount,
          {
            value: (await this.offers.offerFee()).toString(),
          }
        );
      }, 'Pausable: paused');

      await this.offersAs(this.CEO).unpause();
      await this.tokensAs(this.OWNER).setApprovalForAll(this.offers.address, true);
      this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, endTimeSec, amount, {
        value: (await this.offers.offerFee()).toString(),
      });
    });

    it('should revert from any other role', async function () {
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CEO.address);
      let f = async (s: SignerWithAddress) => await this.offersAs(s).pause();
      let m = 'Only CEO';
      expect(await this.checkAllRoles(notAllowed, f, m));

      await this.offersAs(this.CEO).pause();

      f = async (s: SignerWithAddress) => await this.offersAs(s).unpause();
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('cancelAllOffers', function () {
    this.timeout(20000);

    it('should revert if not paused', async function () {
      await this.toRevert(async () => {
        await this.offersAs(this.CEO).cancelAllOffers(50);
      }, 'Pausable: not paused');
    });

    it('should cancel 100 offers as CEO', async function () {
      expect(await this.offers.nextOfferKeyIndex()).to.be.equal(0);

      let bid = 12;

      let b0 = 10000;
      await this.creditSCI(this.ANYONE, b0);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(b0);

      // mint and list 100 NFTs
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);
      for (let i = 0; i < 100; i++) {
        let tokenId = await this.mintNextNFT();

        await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, 0, bid, {
          value: (await this.offers.offerFee()).toString(),
        });

        expect(await this.balanceSCI(this.offers)).to.equal(bid * (i + 1));
        expect(await this.balanceSCI(this.ANYONE)).to.equal(b0 - bid * (i + 1));
      }

      let b1 = await this.balanceSCI(this.ANYONE);
      let b2 = await this.balanceSCI(this.offers);

      let N1 = await this.tokens.FIRST_NFT();
      // cancel two
      await this.offersAs(this.ANYONE).cancelOffer(this.ANYONE.address, N1);
      let data = await this.offers.buyerOffers(
        await this.offers.encodeKey(this.ANYONE.address, N1)
      );
      expect(data.buyer).to.equal(ethers.constants.AddressZero);

      expect(await this.balanceSCI(this.offers)).to.equal(b2 - bid);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(b1 + bid);

      await this.offersAs(this.ANYONE).cancelOffer(this.ANYONE.address, N1 + 1);
      data = await this.offers.buyerOffers(
        await this.offers.encodeKey(this.ANYONE.address, N1 + 1)
      );
      expect(data.buyer).to.equal(ethers.constants.AddressZero);
      expect(await this.balanceSCI(this.offers)).to.equal(b2 - 2 * bid);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(b1 + 2 * bid);

      // withdraw 50 NFTs -- since we canceled two, expect nextIndex 52
      await this.offersAs(this.CEO).pause();
      await this.offersAs(this.CEO).cancelAllOffers(50);
      expect(await this.offers.nextOfferKeyIndex()).to.be.equal(52);

      for (let tokenId = N1; tokenId < N1 + 100; tokenId++) {
        expect(
          (await this.offers.buyerOffers(await this.offers.encodeKey(this.ANYONE.address, tokenId)))
            .buyer
        ).to.equal(tokenId < N1 + 52 ? ethers.constants.AddressZero : this.ANYONE.address);
      }

      // withdraw 10 NFTs -- since we canceled two, expect nextIndex 52
      await this.offersAs(this.CEO).cancelAllOffers(10);
      expect(await this.offers.nextOfferKeyIndex()).to.be.equal(62);
      for (let tokenId = N1; tokenId < N1 + 100; tokenId++) {
        expect(
          (await this.offers.buyerOffers(await this.offers.encodeKey(this.ANYONE.address, tokenId)))
            .buyer
        ).to.equal(tokenId < N1 + 62 ? ethers.constants.AddressZero : this.ANYONE.address);
      }

      // withdraw the remainder (exits early without complaint)
      expect(await this.offersAs(this.CEO).cancelAllOffers(50));
      expect(await this.offers.nextOfferKeyIndex()).to.be.equal(100);

      expect(await this.balanceSCI(this.offers)).to.equal(0);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(b0);

      // check that all the offers were canceled
      for (let tokenId = N1; tokenId < N1 + 100; tokenId++) {
        expect(
          (await this.offers.buyerOffers(await this.offers.encodeKey(this.ANYONE.address, tokenId)))
            .buyer
        ).to.equal(ethers.constants.AddressZero);
      }
    });

    it('should revert from any other role', async function () {
      await this.offersAs(this.CEO).pause();
      expect(await this.offers.nextOfferKeyIndex()).to.be.equal(0);
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CEO.address);
      let f = async (s: SignerWithAddress) => await this.offersAs(s).cancelAllOffers(1);
      let m = 'Only CEO';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('withdraw fees', function () {
    it('should withdraw fees as CFO', async function () {
      let bid = 19;
      let b0 = 10000;
      await this.creditSCI(this.ANYONE, b0);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(b0);
      let balanceBefore = await this.BRIDGE.getBalance();
      // mint 5 NFTs
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);
      for (let i = 0; i < 5; i++) {
        let tokenId = await this.mintNextNFT();
        await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, 0, bid, {
          value: (await this.offers.offerFee()).toString(),
        });
      }
      let total_fees = (await this.offers.offerFee()).mul(5);
      await this.offersAs(this.CFO).withdraw(this.BRIDGE.address, total_fees);
      expect(await this.BRIDGE.getBalance()).to.equal(balanceBefore.add(total_fees));
    });

    it('should revert from any other role', async function () {
      let bid = 19;
      let b0 = 10000;
      await this.creditSCI(this.ANYONE, b0);
      expect(await this.balanceSCI(this.ANYONE)).to.equal(b0);
      await this.tokensAs(this.ANYONE).setApprovalForAll(this.offers.address, true);
      let tokenId = await this.mintNextNFT();
      await this.offersAs(this.ANYONE).setOffer(tokenId, this.ANYONE.address, 0, bid, {
        value: (await this.offers.offerFee()).toString(),
      });

      let one_fee = await this.offers.offerFee();
      let balanceBefore = await this.BRIDGE.getBalance();

      let allSigners = await ethers.getSigners();
      // we exclude BRIDGE here only so that we don't spend a little gas
      let notAllowed = allSigners.filter(
        (s) => s.address != this.CFO.address && s.address != this.BRIDGE.address
      );
      let f = async (s: SignerWithAddress) =>
        await this.offersAs(s).withdraw(this.ANYONE.address, one_fee);
      let m = 'Only CFO';
      expect(await this.checkAllRoles(notAllowed, f, m));

      await this.offersAs(this.CFO).withdraw(this.BRIDGE.address, one_fee);
      expect(await this.BRIDGE.getBalance()).to.equal(balanceBefore.add(one_fee));
    });
  });

  describe('withdrawTokens', function () {
    it('should withdraw SCI or NFTs from contract address as the CFO', async function () {
      let contractAddress = this.offers.address;
      // provide owner with an NFT and some SCI
      let sciId = await this.tokens.SCI();
      let tokenId = await this.mintNextNFT();
      await this.creditSCI(this.OWNER, 100);

      expect(await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, sciId)).to.equal(
        100
      );
      expect(await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, tokenId)).to.equal(
        1
      );

      // move the NFT and SCI to the contact address (a bad idea)
      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);

      await this.tokensAs(this.OWNER).safeBatchTransferFrom(
        this.OWNER.address,
        contractAddress,
        [sciId, tokenId],
        [100, 1],
        IGNORED_DATA
      );

      expect(await this.tokens['balanceOf(address,uint256)'](contractAddress, sciId)).to.equal(100);
      expect(await this.tokens['balanceOf(address,uint256)'](contractAddress, tokenId)).to.equal(1);

      // recover ERC1155 tokens from contract
      await this.offersAs(this.CFO).withdrawTokens(this.CFO.address, tokenId, 1);
      expect(await this.tokens['balanceOf(address,uint256)'](contractAddress, tokenId)).to.equal(0);

      // recover SCI tokens from contract
      await this.offersAs(this.CFO).withdrawTokens(this.CFO.address, sciId, 100);
      expect(await this.tokens['balanceOf(address,uint256)'](contractAddress, sciId)).to.equal(0);
    });

    it('should revert on insufficient funds', async function () {
      let contractAddress = this.offers.address;
      // provide owner with an NFT and some SCI
      let amountSCI = BigNumber.from(1234);
      let sciId = await this.tokens.SCI();
      let tokenId = await this.mintNextNFT();
      await this.creditSCI(this.OWNER, amountSCI);

      // move the NFT and SCI to the contact address (a bad idea)
      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);

      await this.tokensAs(this.OWNER).safeBatchTransferFrom(
        this.OWNER.address,
        contractAddress,
        [sciId, tokenId],
        [100, 1],
        IGNORED_DATA
      );

      await this.toRevert(async () => {
        await this.offersAs(this.CFO).withdrawTokens(this.CFO.address, sciId, amountSCI.add(1));
      }, 'Value exceeds balance');
    });

    it('should revert as any other role', async function () {
      let contractAddress = this.offers.address;
      // provide owner with an NFT and some SCI
      let amountSCI = BigNumber.from(12346);
      let sciId = await this.tokens.SCI();
      let tokenId = await this.mintNextNFT();
      await this.creditSCI(this.OWNER, amountSCI);

      // move the NFT and SCI to the contact address (a bad idea)
      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);

      await this.tokensAs(this.OWNER).safeBatchTransferFrom(
        this.OWNER.address,
        contractAddress,
        [sciId, tokenId],
        [100, 1],
        IGNORED_DATA
      );

      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CFO.address);
      let f = async (s: SignerWithAddress) =>
        await this.offersAs(s).withdrawTokens(this.CFO.address, sciId, amountSCI);
      let m = 'Only CFO';
      expect(await this.checkAllRoles(notAllowed, f, m));

      f = async (s: SignerWithAddress) =>
        await this.offersAs(s).withdrawTokens(this.CFO.address, tokenId, 1);
      m = 'Only CFO';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });
});

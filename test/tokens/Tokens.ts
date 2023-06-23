import { expect } from 'chai';
import { keccak256 } from '@ethersproject/keccak256';
import { toUtf8Bytes } from '@ethersproject/strings';
// @ts-ignore
import { ethers } from 'hardhat';

import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployTokensFixture } from './Tokens.fixture';
import { randomBytes } from 'crypto';
import { BigNumber, Event } from 'ethers';
import { time } from '@nomicfoundation/hardhat-network-helpers';

import type { Tokens } from '../../types/contracts/Tokens';
import { Tokens__factory } from '../../types/factories/contracts/Tokens__factory';

// arbitrary HASH values
const OWNER_HASH_1 = keccak256(toUtf8Bytes('OWNER_HASH_1'));
const OWNER_HASH_2 = keccak256(toUtf8Bytes('OWNER_HASH_2'));
const OWNER_HASH_3 = keccak256(toUtf8Bytes('OWNER_HASH_3'));
const ADMIN_HASH_1 = keccak256(toUtf8Bytes('ADMIN_HASH_1'));
const ADMIN_HASH_2 = keccak256(toUtf8Bytes('ADMIN_HASH_2'));
const ADMIN_HASH_3 = keccak256(toUtf8Bytes('ADMIN_HASH_3'));

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

const hashToValue = {
  [ADMIN_HASH_1]: 'ADMIN_HASH_1',
  [OWNER_HASH_1]: 'OWNER_HASH_1',
  [ADMIN_HASH_2]: 'ADMIN_HASH_2',
  [OWNER_HASH_2]: 'OWNER_HASH_2',
  [ADMIN_HASH_3]: 'ADMIN_HASH_3',
  [OWNER_HASH_3]: 'OWNER_HASH_3',
  [ZERO_HASH]: 'ZERO_HASH',
};
function lookupHash(hash: string): string {
  return hashToValue[hash] || 'Unknown Hash';
}

console.log(`
\n
[${ADMIN_HASH_1}]: 'ADMIN_HASH_1'
[${OWNER_HASH_1}]: 'OWNER_HASH_1'
[${ADMIN_HASH_2}]: 'ADMIN_HASH_2'
[${OWNER_HASH_2}]: 'OWNER_HASH_2'
[${ADMIN_HASH_3}]: 'ADMIN_HASH_3'
[${OWNER_HASH_3}]: 'OWNER_HASH_3'
[${ZERO_HASH}]: 'ZERO_HASH'
`);

const ENUM_OWNER_CONTENT = 0;
const ENUM_ADMIN_CONTENT = 1;

describe('Tokens Contract', function () {
  beforeEach(async function () {
    const signers: SignerWithAddress[] = await ethers.getSigners();
    [
      this.CEO,
      this.CFO,
      this.SUPERADMIN,
      this.OWNER,
      this.ADMIN,
      this.BENEFICIARY,
      this.LISTINGS_CONTRACT,
      this.OFFERS_CONTRACT,
      this.BRIDGE,
      this.ANYONE,
    ] = signers;
    const { EVERYONE, tokens } = await loadFixture(deployTokensFixture);
    this.tokens = tokens;
    this.EVERYONE = EVERYONE;
    this.tokensAs = (signer: SignerWithAddress) =>
      new ethers.Contract(tokens.address, tokens.interface, signer);

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

    let _nextNFTIndex: number = await this.tokens.FIRST_NFT();

    this.mintNFTWithOwnerAndAdmin = (): Promise<number> =>
      this.tokens.mintingFee().then((fee: BigNumber) => {
        return this.tokensAs(this.OWNER)
          ['mintNFT(bytes32)'](ADMIN_HASH_1, {
            value: fee.toString(),
          })
          .then(async (_: any) => {
            // observe the expected events
            expect(await this.tokens.FULL_BENEFIT_FLAG()).to.equal(2);
            expect(await this.tokens.UNSET_FULL_BENEFIT_FLAG()).to.equal(1);
            let status = BigNumber.from(3);
            let filter = this.tokens.filters.NFTUpdated();
            let events = await this.tokens.queryFilter(filter);

            // skip the check if we end up with multiple events in the same block
            if (events.length == 1) {
              expect(events[0].args.tokenId).to.equal(_nextNFTIndex);
              expect(events[0].args.status).to.equal(status);
              expect(events[0].args.owner).to.equal(this.OWNER.address);
              expect(events[0].args.admin).to.equal(this.OWNER.address);
              expect(events[0].args.beneficiary).to.equal(this.OWNER.address);
            }

            filter = this.tokens.filters.AdminContentNodeCreated();
            events = await this.tokens.queryFilter(filter);
            if (events.length == 1) {
              expect(events[0].args.tokenId).to.equal(_nextNFTIndex);
              expect(events[0].args.data).to.equal(ADMIN_HASH_1);
              expect(events[0].args.prev).to.equal(ZERO_HASH);
            }
            await this.tokensAs(this.OWNER).setAdmin(_nextNFTIndex, this.ADMIN.address);
            return _nextNFTIndex++;
          });
      });
  });

  describe('Deployment', function () {
    it('should have the CEO_ROLE value match the AccessControl default of 0x0', async function () {
      expect(await this.tokens.CEO_ROLE()).to.equal(
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      );
    });

    it('should set _uri to value in env', async function () {
      let processUri: string | undefined = process.env.METADATA_JSON_URI;
      const uri = processUri ? processUri : 'http://www.scienft.com/token-{id}.json';
      expect(await this.tokens.uri(0)).to.be.equal(uri);

      let envInitialMiningYield: string | undefined = process.env.INITIAL_MINING_YIELD_SCI;
      let initialMiningYield = ethers.BigNumber.from(envInitialMiningYield).mul(
        ethers.BigNumber.from(10).pow(18)
      );
      expect(await this.tokens.miningYield()).to.be.equal(initialMiningYield);

      let envMinimumMiningYield: string | undefined = process.env.MINIMUM_MINING_YIELD_SCI;
      let minimumMiningYield = ethers.BigNumber.from(envMinimumMiningYield).mul(
        ethers.BigNumber.from(10).pow(18)
      );
      expect(await this.tokens.minimumMiningYield()).to.be.equal(minimumMiningYield);

      let envMaxTotalSupply: string | undefined = process.env.MAXIMUM_TOTAL_SUPPLY_SCI;
      let maxTotalSupply = ethers.BigNumber.from(envMaxTotalSupply).mul(
        ethers.BigNumber.from(10).pow(18)
      );
      expect(await this.tokens.maxTotalSupply()).to.be.equal(maxTotalSupply);

      let envMiningIntervalSeconds: string | undefined = process.env.MINING_INTERVAL_SECONDS;
      let miningIntervalSeconds = BigNumber.from(envMiningIntervalSeconds);

      expect(await this.tokens.miningIntervalSeconds()).to.be.equal(miningIntervalSeconds);
    });

    it('should grant the CEO role to contract deployment sender', async function () {
      expect(await this.tokens.hasRole(await this.tokens.CEO_ROLE(), this.CEO.address)).to.be.true;
    });

    it('should grant expected roles in fixture', async function () {
      const roles: string[] = [
        await this.tokens.CFO_ROLE(),
        await this.tokens.SUPERADMIN_ROLE(),
        await this.tokens.MARKETPLACE_ROLE(), // for listings
        await this.tokens.MARKETPLACE_ROLE(), // for offers
        await this.tokens.BRIDGE_ROLE(),
      ];
      const addresses: string[] = [
        this.CFO.address,
        this.SUPERADMIN.address,
        this.LISTINGS_CONTRACT.address,
        this.OFFERS_CONTRACT.address,
        this.BRIDGE.address,
      ];

      for (const [i, a] of addresses.entries()) {
        expect(await this.tokens.hasRole(roles[i], a)).to.be.true;
      }
    });

    it('should support all expected ERC165 interfaces', async function () {
      function toBytes4(s: string) {
        var b4 = new Uint8Array(4);
        for (var i = 0; i < 4; i++) {
          b4[i] = parseInt(s.substring(i * 2, (i + 1) * 2), 16);
        }
        return b4;
      }
      const IID_IERC165 = toBytes4('01ffc9a7'); // type(IERC165).interfaceId
      const IID_IACCESS_CONTROL = toBytes4('7965db0b'); // type(IAccessControl).interfaceId
      const IID_IERC1155 = toBytes4('d9b67a26'); // type(IERC1155).interfaceId;
      const IID_IERC20 = toBytes4('36372b07'); // type(IERC20).interfaceId;
      const IID_IERC20Metadata = toBytes4('a219a025'); // type(IERC20Metadata).interfaceId;
      const IID_IERC1155MetadataURI = toBytes4('0e89341c'); // type(IERC1155MetadataURI).interfaceId;
      expect(await this.tokens.supportsInterface(IID_IERC165)).to.be.true;
      expect(await this.tokens.supportsInterface(IID_IACCESS_CONTROL)).to.be.true;
      expect(await this.tokens.supportsInterface(IID_IERC1155)).to.be.true;
      expect(await this.tokens.supportsInterface(IID_IERC20)).to.be.true;
      expect(await this.tokens.supportsInterface(IID_IERC20Metadata)).to.be.true;
      expect(await this.tokens.supportsInterface(IID_IERC1155MetadataURI)).to.be.true;
    });

    it('should revert transfers of gas tokens to contract address', async function () {
      await this.toRevert(async () => {
        await this.CEO.sendTransaction({ to: this.tokens.address, value: 100 });
      }, 'receive() reverts');
    });

    it('should revert on fallback', async function () {
      const nonExistentFuncSignature = 'nonExistentFunc(uint256,uint256)';
      const fakeDemoContract = new ethers.Contract(
        this.tokens.address,
        [...this.tokens.interface.fragments, `function ${nonExistentFuncSignature}`],
        this.CEO
      );
      await this.toRevert(async () => {
        await fakeDemoContract[nonExistentFuncSignature](8, 9);
      }, 'fallback() reverts');
    });

    it('should revert on internal function errors', async function () {
      // deploy the ExposedTokens contract
      let initialMiningYield = ethers.BigNumber.from(16).mul(BigNumber.from(10).pow(18));
      let minimumMiningYield = ethers.BigNumber.from(1).mul(BigNumber.from(10).pow(18));
      let maxTotalSupply = ethers.BigNumber.from(40).mul(BigNumber.from(10).pow(18));
      let miningIntervalSeconds = ethers.BigNumber.from(1);
      let difficulty = 0;
      let miningFee = 1234;
      let mintingFee = 1234;
      let factory = await ethers.getContractFactory('ExposedTokens', this.CEO);
      let exposedTokens = await factory.deploy(
        'http://example.com/{id}.json',
        initialMiningYield,
        minimumMiningYield,
        miningFee,
        difficulty,
        miningIntervalSeconds,
        maxTotalSupply,
        mintingFee
      );
      await exposedTokens.deployed();

      await this.toRevert(async () => {
        await exposedTokens.testInternal(0);
      }, 'ERC20: transfer from the zero address');

      await this.toRevert(async () => {
        await exposedTokens.testInternal(1);
      }, 'ERC20: approve from the zero address');

      await this.toRevert(async () => {
        await exposedTokens.testInternal(2);
      }, 'ERC1155: transfer to the zero address');

      await this.toRevert(async () => {
        await exposedTokens.testInternal(3);
      }, 'ERC1155: transfer to the zero address');

      await this.toRevert(async () => {
        await exposedTokens.testInternal(4);
      }, 'ERC1155: mint to the zero address');

      await this.toRevert(async () => {
        await exposedTokens.testInternal(5);
      }, 'Invalid NFT');

      await this.toRevert(async () => {
        await exposedTokens.testInternal(6);
      }, 'Invalid test index');
    });
  });

  describe('balance functions', function () {
    it('balanceOf should reject for address zero', async function () {
      await this.toRevert(async () => {
        await this.tokens['balanceOf(address,uint256)'](
          '0x0000000000000000000000000000000000000000',
          this.tokens.SCI()
        );
      }, 'ERC1155: address zero is not a valid owner');
    });

    it('balanceOfBatch should reject for array length mismatch', async function () {
      await this.toRevert(async () => {
        await this.tokens.balanceOfBatch([this.CEO.address, this.CFO.address], [0, 1, 2, 3]);
      }, 'ERC1155: accounts and ids length mismatch');
    });
  });

  describe('mineSCI', function () {
    it('should mine SCI tokens as expected', async function () {
      let fee = 12345;
      await this.tokensAs(this.CFO).setMiningFee(fee);
      let solution = randomBytes(32);
      let firstMiningYield = await this.tokens.miningYield();
      for (let i = 0; i < 32; i++) {
        let done = false;
        while (!done) {
          solution = randomBytes(32);
          done = await this.tokens.isCorrect(solution);
        }
        let miningYieldValue = await this.tokens.miningYield();
        let balanceBefore = await this.tokens['balanceOf(address,uint256)'](
          this.ANYONE.address,
          this.tokens.SCI()
        );

        let lastTime = BigNumber.from(await time.latest());
        let interval = BigNumber.from(await this.tokensAs(this.ANYONE).miningIntervalSeconds());
        time.setNextBlockTimestamp(lastTime.add(interval).add(1));

        await this.tokensAs(this.ANYONE).mineSCI(solution, this.ANYONE.address, {
          value: BigNumber.from(fee).toString(),
        });
        let balanceAfter = await this.tokens['balanceOf(address,uint256)'](
          this.ANYONE.address,
          this.tokens.SCI()
        );
        expect(balanceAfter.sub(balanceBefore)).to.equal(miningYieldValue);
        expect(await this.tokens.lastMiningSolution()).to.equal(ethers.utils.hexlify(solution));
      }
      expect(await this.tokens.miningGeneration()).to.equal(5);
      // we mined 32 times, generation 5 yield should be decreased by 4^5 = 1024
      expect(await this.tokens.miningYield()).to.equal(firstMiningYield.div(1024));
    }).timeout(10000);

    it('should hit a minimum miningYield and stop at maxTotalSupply as expected', async function () {
      // here we redeploy with parameters that reduce the time required to test supply
      let initialMiningYield = ethers.BigNumber.from(16).mul(BigNumber.from(10).pow(18));
      let minimumMiningYield = ethers.BigNumber.from(1).mul(BigNumber.from(10).pow(18));
      let maxTotalSupply = ethers.BigNumber.from(40).mul(BigNumber.from(10).pow(18));
      let miningIntervalSeconds = ethers.BigNumber.from(1);
      let difficulty = 0;
      let miningFee = 1234;
      let mintingFee = 1234;

      //redeploy the tokens contract because we need its address
      let factory: Tokens__factory = <Tokens__factory>(
        await ethers.getContractFactory('Tokens', this.CEO)
      );
      let fastTokensAsCEO: Tokens = await factory.deploy(
        'http://example.com/{id}.json',
        initialMiningYield,
        minimumMiningYield,
        miningFee,
        difficulty,
        miningIntervalSeconds,
        maxTotalSupply,
        mintingFee
      );
      await fastTokensAsCEO.grantRole(await fastTokensAsCEO.CFO_ROLE(), this.CFO.address);

      let fastTokensAsCFO = new ethers.Contract(
        fastTokensAsCEO.address,
        fastTokensAsCEO.interface,
        this.CFO
      );
      await fastTokensAsCFO.setMiningFee(0);
      await fastTokensAsCFO.setDifficulty(0);

      let firstMiningYield = await fastTokensAsCEO.miningYield();
      let minMiningYield = await fastTokensAsCEO.minimumMiningYield();
      let generation = await fastTokensAsCEO.miningGeneration();

      expect(firstMiningYield).to.equal(initialMiningYield);
      expect(minMiningYield).to.equal(minimumMiningYield);
      expect(generation).to.equal(0);

      // mine until we hit minimum
      let i = 0;
      while (true) {
        let thisG = await fastTokensAsCEO.miningGeneration();
        if (i == 0 || generation != thisG) {
          console.log(
            'mining    ',
            String(i).padStart(10),
            String(await fastTokensAsCEO.miningGeneration()).padStart(8),
            String(await fastTokensAsCEO.miningCount()).padStart(8),
            String(await fastTokensAsCEO.miningYield()).padStart(36)
          );
          let divideBy = 4 ** thisG;
          let expected = firstMiningYield.div(divideBy);

          if (expected.lt(minMiningYield)) {
            expect(await fastTokensAsCEO.miningYield()).to.equal(minMiningYield);
            break;
          }
          expect(await fastTokensAsCEO.miningYield()).to.equal(expected);
          generation = thisG;
        }

        let lastTime = BigNumber.from(await time.latest());
        let interval = BigNumber.from(await fastTokensAsCEO.miningIntervalSeconds());
        time.setNextBlockTimestamp(lastTime.add(interval).add(1));
        await fastTokensAsCEO.mineSCI(randomBytes(32), this.CEO.address);
        i++;
      }
      expect(await fastTokensAsCEO.miningYield()).to.equal(minimumMiningYield);

      let remainingSupply = maxTotalSupply.sub(await fastTokensAsCEO.totalSupply());
      let remainingCalls = remainingSupply.div(await fastTokensAsCEO.miningYield()).toNumber();
      // mine until we hit minimum
      while (remainingCalls > 0) {
        let balanceBefore = await fastTokensAsCEO['balanceOf(address,uint256)'](
          this.CEO.address,
          this.tokens.SCI()
        );
        let lastTime = BigNumber.from(await time.latest());
        let interval = BigNumber.from(await fastTokensAsCEO.miningIntervalSeconds());
        time.setNextBlockTimestamp(lastTime.add(interval).add(1));
        await fastTokensAsCEO.mineSCI(randomBytes(32), this.CEO.address);
        let balanceAfter = await fastTokensAsCEO['balanceOf(address,uint256)'](
          this.CEO.address,
          this.tokens.SCI()
        );
        remainingCalls--;
      }

      await this.toRevert(async () => {
        await fastTokensAsCEO.mineSCI(randomBytes(32), this.ANYONE.address, {
          value: BigNumber.from(0).toString(),
        });
      }, 'Maximum supply has been mined');

      expect(await fastTokensAsCEO.totalSupply()).to.equal(maxTotalSupply);
    }).timeout(10000);

    it('should reject with zero fee', async function () {
      let fee = 123999;
      await this.tokensAs(this.CFO).setMiningFee(fee);
      let solution = randomBytes(32);
      let done = false;
      while (!done) {
        solution = randomBytes(32);
        done = await this.tokens.isCorrect(solution);
      }
      let lastTime = BigNumber.from(await time.latest());
      let interval = BigNumber.from(await this.tokensAs(this.CFO).miningIntervalSeconds());
      time.setNextBlockTimestamp(lastTime.add(interval).add(1));

      await this.toRevert(async () => {
        await this.tokensAs(this.ANYONE).mineSCI(solution, this.ANYONE.address, {
          value: BigNumber.from(0).toString(),
        });
      }, 'Wrong mining fee');
    });

    it('should reject with wrong fee', async function () {
      let fee = 123999;
      await this.tokensAs(this.CFO).setMiningFee(fee);
      let solution = randomBytes(32);
      let done = false;
      while (!done) {
        solution = randomBytes(32);
        done = await this.tokens.isCorrect(solution);
      }
      let lastTime = BigNumber.from(await time.latest());
      let interval = BigNumber.from(await this.tokensAs(this.CFO).miningIntervalSeconds());
      time.setNextBlockTimestamp(lastTime.add(interval).add(1));

      await this.toRevert(async () => {
        await this.tokensAs(this.ANYONE).mineSCI(solution, this.ANYONE.address, {
          value: BigNumber.from(fee + 1).toString(),
        });
      }, 'Wrong mining fee');
    });

    it('should reject with an incorrect solution', async function () {
      let fee = 123999;

      let tx = await this.tokensAs(this.CFO).setMiningFee(fee);
      const receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'MiningFeeSet')).to.not.be.null;
      expect(receipt.events[0].args.miningFee).to.equal(fee);

      let solution = randomBytes(32);
      let done = false;
      while (!done) {
        solution = randomBytes(32);
        done = !(await this.tokens.isCorrect(solution));
      }
      let lastTime = BigNumber.from(await time.latest());
      let interval = BigNumber.from(await this.tokensAs(this.CFO).miningIntervalSeconds());
      time.setNextBlockTimestamp(lastTime.add(interval).add(1));
      await this.toRevert(async () => {
        await this.tokensAs(this.ANYONE).mineSCI(solution, this.ANYONE.address, {
          value: BigNumber.from(fee).toString(),
        });
      }, 'Wrong solution');
    });
  });

  describe('superadminMintNFT', function () {
    const createdAt = BigNumber.from(1668162853);
    const status = 11;

    it('should mint an NFT with arbitrary values as the SUPERADMIN', async function () {
      let status = BigNumber.from(287341290872345);
      let tokenId = await this.mintNFTWithOwnerAndAdmin();

      await this.tokensAs(this.SUPERADMIN).superadminMintNFT(
        ADMIN_HASH_1,
        createdAt,
        status,
        this.OWNER.address,
        this.ADMIN.address,
        this.BENEFICIARY.address
      );
      expect(
        await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, tokenId + 1)
      ).to.equal(1);
      expect((await this.tokens.scienceNFTs(tokenId + 1)).createdAt).to.equal(createdAt);
      expect((await this.tokens.scienceNFTs(tokenId + 1)).status).to.equal(status);
    });

    it('should revert as any other role', async function () {
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.SUPERADMIN.address);
      let f = async (s: SignerWithAddress) =>
        await this.tokensAs(s).superadminMintNFT(
          ADMIN_HASH_1,
          createdAt,
          status,
          this.OWNER.address,
          this.ADMIN.address,
          this.BENEFICIARY.address
        );
      let m = 'Only SUPERADMIN';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('mintNFT', function () {
    it('should mint an NFT as the OWNER without fee payment when fees are set to zero', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](ADMIN_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      expect(
        await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, tokenId + 1)
      ).to.equal(1);
    });

    it('should revert minting an NFT with a hash of 0x0', async function () {
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](ZERO_HASH, {
          value: (await this.tokens.mintingFee()).toString(),
        });
      }, 'Invalid content');
    });

    it('should revert minting an NFT without fee payment', async function () {
      let tx = await this.tokensAs(this.CFO).setMintingFee(123);
      const receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'MintingFeeSet')).to.not.be.null;
      expect(receipt.events[0].args.mintingFee).to.equal(123);

      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](ADMIN_HASH_1, {
          value: BigNumber.from(0).toString(),
        });
      }, 'Wrong minting fee');
    });

    it('should revert minting an NFT with incorrect fee payment', async function () {
      await this.tokensAs(this.CFO).setMintingFee(1);

      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](ADMIN_HASH_1, {
          value: BigNumber.from(2).toString(),
        });
      }, 'Wrong minting fee');
    });

    it('should mint an NFT with correct fee payment', async function () {
      let mintingFee = ethers.BigNumber.from(1234567);
      await this.tokensAs(this.CFO).setMintingFee(mintingFee);
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      expect(
        await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, tokenId + 1)
      ).to.equal(0);
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](ADMIN_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      expect(
        await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, tokenId + 1)
      ).to.equal(1);
      expect(
        await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, tokenId + 1)
      ).to.equal(1);
    });

    it('should mint an NFT with expected status', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](ADMIN_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      let expectedStatus =
        (await this.tokens.FULL_BENEFIT_FLAG()) | (await this.tokens.UNSET_FULL_BENEFIT_FLAG());
      expect((await this.tokens.scienceNFTs(tokenId + 1)).status).to.be.equal(expectedStatus);
    });

    it('should mint NFT with correct minting fee for full parameter version', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      let status = 11;

      await this.tokensAs(this.OWNER)['mintNFT(bytes32,uint192,address,address,address)'](
        ADMIN_HASH_1,
        BigNumber.from(status),
        this.OWNER.address,
        this.ADMIN.address,
        this.BENEFICIARY.address,
        {
          value: (await this.tokens.mintingFee()).toString(),
        }
      );

      const nftData = await this.tokens.scienceNFTs(tokenId + 1);
      const nftOwner = await this.tokens.ownerOf(tokenId + 1);
      const nftAdmin = await this.tokens.adminOf(tokenId + 1);
      const nftBeneficiary = await this.tokens.beneficiaryOf(tokenId + 1);

      expect(nftData.adminHash).to.equal(ADMIN_HASH_1);
      expect(nftData.status).to.equal(status);
      expect(nftOwner).to.equal(this.OWNER.address);
      expect(nftAdmin).to.equal(this.ADMIN.address);
      expect(nftBeneficiary).to.equal(this.BENEFICIARY.address);
    });

    it('should fail with incorrect minting fee', async function () {
      const incorrectFee = (await this.tokens.mintingFee()).sub(1);
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER)['mintNFT(bytes32,uint192,address,address,address)'](
          ADMIN_HASH_1,
          BigNumber.from(3),
          this.OWNER.address,
          this.ADMIN.address,
          this.BENEFICIARY.address,
          {
            value: incorrectFee.toString(),
          }
        );
      }, 'Wrong minting fee');
    });

    it('should emit NFTUpdated event on successful minting', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      let status = 11;
      let tx = await this.tokensAs(this.OWNER)['mintNFT(bytes32,uint192,address,address,address)'](
        ADMIN_HASH_1,
        BigNumber.from(status),
        this.OWNER.address,
        this.ADMIN.address,
        this.BENEFICIARY.address,
        {
          value: (await this.tokens.mintingFee()).toString(),
        }
      );

      const receipt = await tx.wait();

      expect(receipt.events?.filter((x: Event) => x.event == 'NFTUpdated')).to.not.be.null;
      expect(receipt.events?.filter((x: Event) => x.event == 'AdminContentNodeCreated')).to.not.be
        .null;

      let NFTUpdatedEvent = receipt.events.find((e: any) => e.event == 'NFTUpdated');
      expect(NFTUpdatedEvent.args.tokenId).to.equal(tokenId + 1);
      expect(NFTUpdatedEvent.args.status).to.equal(status);
      expect(NFTUpdatedEvent.args.owner).to.equal(await this.OWNER.getAddress());
      expect(NFTUpdatedEvent.args.admin).to.equal(await this.ADMIN.getAddress());
      expect(NFTUpdatedEvent.args.beneficiary).to.equal(await this.BENEFICIARY.getAddress());

      let adminContentNodeCreatedEvent = receipt.events.find(
        (e: any) => e.event == 'AdminContentNodeCreated'
      );
      expect(adminContentNodeCreatedEvent.args.tokenId).to.equal(tokenId + 1);
      expect(adminContentNodeCreatedEvent.args.data).to.equal(ADMIN_HASH_1);
      expect(adminContentNodeCreatedEvent.args.prev).to.equal(ZERO_HASH);
    });
  });

  describe('safeTransferFrom', function () {
    it('should transfer one NFT from sender to receiver', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();

      expect(await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, tokenId)).to.equal(
        1
      );
      expect(
        await this.tokens['balanceOf(address,uint256)'](this.ANYONE.address, tokenId)
      ).to.equal(0);

      let NFT_INDEX = tokenId;
      let NFT_AMOUNT = 1;
      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);

      await this.tokensAs(this.OWNER).safeTransferFrom(
        this.OWNER.address,
        this.ANYONE.address,
        NFT_INDEX,
        NFT_AMOUNT,
        IGNORED_DATA
      );

      expect(
        await this.tokens['balanceOf(address,uint256)'](this.ANYONE.address, tokenId)
      ).to.equal(1);
      expect(await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, tokenId)).to.equal(
        0
      );
      expect(
        await this.tokens['balanceOf(address,uint256)'](this.ANYONE.address, tokenId)
      ).to.equal(1);
    });

    it('should revert when blance is insufficient', async function () {
      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).safeTransferFrom(
          this.OWNER.address,
          this.ANYONE.address,
          0,
          1000, // OWNER has no SCI
          IGNORED_DATA
        );
      }, 'ERC1155: insufficient balance for transfer');
    });

    it('should revert when NFT does not exist', async function () {
      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).safeTransferFrom(
          this.OWNER.address,
          this.ANYONE.address,
          1000,
          1,
          IGNORED_DATA
        );
      }, 'Invalid NFT');
    });

    it('should revert when msg.sender is not the owner or is not authorized', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();

      expect(await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, tokenId)).to.equal(
        1
      );
      expect(
        await this.tokens['balanceOf(address,uint256)'](this.ANYONE.address, tokenId)
      ).to.equal(0);

      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);
      await this.toRevert(async () => {
        await this.tokensAs(this.CFO).safeTransferFrom(
          this.OWNER.address,
          this.ANYONE.address,
          tokenId,
          1,
          IGNORED_DATA
        );
      }, 'ERC1155: caller is not token owner or approved');
      // if the CFO is approved, the transfer should succeed
      await this.tokensAs(this.OWNER).setApprovalForAll(this.CFO.address, true);
      await this.tokensAs(this.CFO).safeTransferFrom(
        this.OWNER.address,
        this.ANYONE.address,
        tokenId,
        1,
        IGNORED_DATA
      );
      expect(await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, tokenId)).to.equal(
        0
      );
      expect(
        await this.tokens['balanceOf(address,uint256)'](this.ANYONE.address, tokenId)
      ).to.equal(1);
      // CFO is not approved for ANYONE
      await this.toRevert(async () => {
        await this.tokensAs(this.CFO).safeTransferFrom(
          this.ANYONE.address,
          this.OWNER.address,
          tokenId,
          1,
          IGNORED_DATA
        );
      }, 'ERC1155: caller is not token owner or approved');
      // have ANYONE send back to OWNER
      await this.tokensAs(this.ANYONE).safeTransferFrom(
        this.ANYONE.address,
        this.OWNER.address,
        tokenId,
        1,
        IGNORED_DATA
      );
      // revoke approval for CFO and transaction should fail
      await this.tokensAs(this.OWNER).setApprovalForAll(this.CFO.address, false);
      await this.toRevert(async () => {
        await this.tokensAs(this.CFO).safeTransferFrom(
          this.OWNER.address,
          this.ANYONE.address,
          tokenId,
          1,
          IGNORED_DATA
        );
      }, 'ERC1155: caller is not token owner or approved');
    });

    it('should revert when _doSafeTransferAcceptanceCheck detects non-ERC1155 receiver', async function () {
      // deploy the mock contracts
      let factory = await ethers.getContractFactory('MockERC20', this.CEO);
      let mockERC20 = await factory.deploy('MockToken', 'MKT');
      await mockERC20.deployed();

      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      let NFT_INDEX = tokenId;
      let NFT_AMOUNT = 1;
      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);

      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).safeTransferFrom(
          this.OWNER.address,
          mockERC20.address,
          NFT_INDEX,
          NFT_AMOUNT,
          IGNORED_DATA
        );
      }, 'ERC1155: transfer to non-ERC1155Receiver implementer');
    });

    it('should revert when _doSafeTransferAcceptanceCheck detects ERC1155Receiver rejects transaction', async function () {
      // deploy the mock contracts
      let factory = await ethers.getContractFactory('MockERC1155Rejecting', this.CEO);
      let mockERC1155Receiver = await factory.deploy();
      await mockERC1155Receiver.deployed();

      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      let NFT_INDEX = tokenId;
      let NFT_AMOUNT = 1;
      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);

      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).safeTransferFrom(
          this.OWNER.address,
          mockERC1155Receiver.address,
          NFT_INDEX,
          NFT_AMOUNT,
          IGNORED_DATA
        );
      }, 'ERC1155: ERC1155Receiver rejected tokens');
    });

    it('should revert when _doSafeTransferAcceptanceCheck detects ERC1155Receiver reverts transaction', async function () {
      // deploy the mock contracts
      let factory = await ethers.getContractFactory('MockERC1155Reverting', this.CEO);
      let mockERC1155Receiver = await factory.deploy();
      await mockERC1155Receiver.deployed();

      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      let NFT_INDEX = tokenId;
      let NFT_AMOUNT = 1;
      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);

      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).safeTransferFrom(
          this.OWNER.address,
          mockERC1155Receiver.address,
          NFT_INDEX,
          NFT_AMOUNT,
          IGNORED_DATA
        );
      }, 'contract always reverts');
    });
  });

  describe('safeBatchTransferFrom', function () {
    it('should transfer several NFTs from sender to receiver', async function () {
      let NFTS_TO_TRANSFER = 5;
      let range = [...Array(NFTS_TO_TRANSFER).keys()];

      let NFT_INDEXES: number[] = [];
      for (let i = 0; i < NFTS_TO_TRANSFER; i++) {
        let tokenId = await this.mintNFTWithOwnerAndAdmin();
        NFT_INDEXES.push(tokenId);
      }

      let ownerRepeated = NFT_INDEXES.map((_) => this.OWNER.address);
      let allZeroes = NFT_INDEXES.map((_) => ethers.BigNumber.from(0));
      let anyoneRepeated = NFT_INDEXES.map((_) => this.ANYONE.address);
      let allOnes = NFT_INDEXES.map((_) => ethers.BigNumber.from(1));

      for (const tokenId of NFT_INDEXES) {
        expect(
          await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, tokenId)
        ).to.equal(1);
      }

      for (const tokenId of NFT_INDEXES) {
        expect(
          await this.tokens['balanceOf(address,uint256)'](this.ANYONE.address, tokenId)
        ).to.equal(0);
      }
      expect(await this.tokens.balanceOfBatch(ownerRepeated, NFT_INDEXES)).to.deep.equal(allOnes);
      expect(await this.tokens.balanceOfBatch(anyoneRepeated, NFT_INDEXES)).to.deep.equal(
        allZeroes
      );

      let abiCoder = new ethers.utils.AbiCoder();
      let NFT_AMOUNTS = range.map((_, _i) => 1);
      let IGNORED_DATA = abiCoder.encode([], []);

      // move some SCI too
      await this.creditSCI(this.OWNER, 105);
      await this.tokensAs(this.OWNER).safeBatchTransferFrom(
        this.OWNER.address,
        this.ANYONE.address,
        NFT_INDEXES.concat(0),
        NFT_AMOUNTS.concat(100),
        IGNORED_DATA
      );
      expect(await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, 0)).to.equal(5);

      for (const tokenId of NFT_INDEXES) {
        expect(
          await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, tokenId)
        ).to.equal(0);
      }

      for (const tokenId of NFT_INDEXES) {
        expect(
          await this.tokens['balanceOf(address,uint256)'](this.ANYONE.address, tokenId)
        ).to.equal(1);
      }

      expect(await this.tokens.balanceOfBatch(ownerRepeated, NFT_INDEXES)).to.deep.equal(allZeroes);
      expect(await this.tokens.balanceOfBatch(anyoneRepeated, NFT_INDEXES)).to.deep.equal(allOnes);
      expect(
        await this.tokens.balanceOfBatch(
          ownerRepeated.concat(anyoneRepeated),
          NFT_INDEXES.concat(NFT_INDEXES)
        )
      ).to.deep.equal(allZeroes.concat(allOnes));

      expect(
        await this.tokens.balanceOfBatch(
          anyoneRepeated.concat(anyoneRepeated),
          NFT_INDEXES.concat(NFT_INDEXES)
        )
      ).to.deep.equal(allOnes.concat(allOnes));
    });

    it('should revert when ids and amounts have a length mismatch', async function () {
      let NFTS_TO_TRANSFER = 5;
      let range = [...Array(NFTS_TO_TRANSFER).keys()];

      let NFT_INDEXES: number[] = [];
      let tokenId;
      for (let i = 0; i < NFTS_TO_TRANSFER; i++) {
        tokenId = await this.mintNFTWithOwnerAndAdmin();
        NFT_INDEXES.push(tokenId);
      }
      let NFT_AMOUNTS = range.map((_, _i) => 1);
      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).safeBatchTransferFrom(
          this.OWNER.address,
          this.ANYONE.address,
          NFT_INDEXES,
          NFT_AMOUNTS.concat(1), // wrong length
          IGNORED_DATA
        );
      }, 'ERC1155: ids and amounts length mismatch');
    });

    it('should revert when one of the NFTs does not exist', async function () {
      let NFTS_TO_TRANSFER = 5;
      let range = [...Array(NFTS_TO_TRANSFER).keys()];

      let NFT_INDEXES: number[] = [];
      let tokenId;
      for (let i = 0; i < NFTS_TO_TRANSFER; i++) {
        tokenId = await this.mintNFTWithOwnerAndAdmin();
        NFT_INDEXES.push(tokenId);
      }
      NFT_INDEXES.push(tokenId + 1);
      let NFT_AMOUNTS = range.map((_, _i) => 1);
      NFT_AMOUNTS.push(1);
      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).safeBatchTransferFrom(
          this.OWNER.address,
          this.ANYONE.address,
          NFT_INDEXES,
          NFT_AMOUNTS,
          IGNORED_DATA
        );
      }, 'Invalid NFT');
    });

    it('should revert when blance is insufficient', async function () {
      let NFTS_TO_TRANSFER = 5;
      let range = [...Array(NFTS_TO_TRANSFER).keys()];

      let NFT_INDEXES: number[] = [];
      let tokenId;
      for (let i = 0; i < NFTS_TO_TRANSFER; i++) {
        tokenId = await this.mintNFTWithOwnerAndAdmin();
        NFT_INDEXES.push(tokenId);
      }
      NFT_INDEXES.push(0); // add SCI to the batch
      let NFT_AMOUNTS = range.map((_, _i) => 1);
      NFT_AMOUNTS.push(100); // SCI balance is zero
      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).safeBatchTransferFrom(
          this.OWNER.address,
          this.ANYONE.address,
          NFT_INDEXES,
          NFT_AMOUNTS,
          IGNORED_DATA
        );
      }, 'ERC1155: insufficient balance for transfer');
    });

    it('should revert when msg.sender is not the owner or is not authorized', async function () {
      let NFTS_TO_TRANSFER = 5;
      let range = [...Array(NFTS_TO_TRANSFER).keys()];
      let NFT_INDEXES: number[] = [];
      for (let i = 0; i < NFTS_TO_TRANSFER; i++) {
        let tokenId = await this.mintNFTWithOwnerAndAdmin();
        NFT_INDEXES.push(tokenId);
      }

      let ownerRepeated = NFT_INDEXES.map((_) => this.OWNER.address);
      let allZeroes = NFT_INDEXES.map((_) => ethers.BigNumber.from(0));
      let anyoneRepeated = NFT_INDEXES.map((_) => this.ANYONE.address);
      let allOnes = NFT_INDEXES.map((_) => ethers.BigNumber.from(1));

      expect(await this.tokens.balanceOfBatch(ownerRepeated, NFT_INDEXES)).to.deep.equal(allOnes);
      expect(await this.tokens.balanceOfBatch(anyoneRepeated, NFT_INDEXES)).to.deep.equal(
        allZeroes
      );

      let NFT_AMOUNTS = range.map((_, _i) => 1);
      let abiCoder = new ethers.utils.AbiCoder();
      let IGNORED_DATA = abiCoder.encode([], []);
      await this.toRevert(async () => {
        await this.tokensAs(this.CFO).safeBatchTransferFrom(
          this.OWNER.address,
          this.ANYONE.address,
          NFT_INDEXES,
          NFT_AMOUNTS,
          IGNORED_DATA
        );
      }, 'ERC1155: caller is not token owner or approved');
      // if the CFO is approved, the transfer should succeed
      await this.tokensAs(this.OWNER).setApprovalForAll(this.CFO.address, true);
      await this.tokensAs(this.CFO).safeBatchTransferFrom(
        this.OWNER.address,
        this.ANYONE.address,
        NFT_INDEXES,
        NFT_AMOUNTS,
        IGNORED_DATA
      );

      expect(await this.tokens.balanceOfBatch(ownerRepeated, NFT_INDEXES)).to.deep.equal(allZeroes);
      expect(await this.tokens.balanceOfBatch(anyoneRepeated, NFT_INDEXES)).to.deep.equal(allOnes);

      // CFO is not approved for ANYONE
      await this.toRevert(async () => {
        await this.tokensAs(this.CFO).safeBatchTransferFrom(
          this.ANYONE.address,
          this.OWNER.address,
          NFT_INDEXES,
          NFT_AMOUNTS,
          IGNORED_DATA
        );
      }, 'ERC1155: caller is not token owner or approved');
      // have ANYONE send back to OWNER
      await this.tokensAs(this.ANYONE).safeBatchTransferFrom(
        this.ANYONE.address,
        this.OWNER.address,
        NFT_INDEXES,
        NFT_AMOUNTS,
        IGNORED_DATA
      );

      // revoke approval for CFO and transaction should fail
      await this.tokensAs(this.OWNER).setApprovalForAll(this.CFO.address, false);
      await this.toRevert(async () => {
        await this.tokensAs(this.CFO).safeBatchTransferFrom(
          this.OWNER.address,
          this.ANYONE.address,
          NFT_INDEXES,
          NFT_AMOUNTS,
          IGNORED_DATA
        );
      }, 'ERC1155: caller is not token owner or approved');
    });

    it('should allow when _doSafeTransferAcceptanceCheck detects a ERC1155 receiver', async function () {
      // deploy the mock contracts
      let factory = await ethers.getContractFactory('MockERC1155', this.CEO);
      let MockERC1155 = await factory.deploy();
      await MockERC1155.deployed();

      let NFTS_TO_TRANSFER = 5;
      let range = [...Array(NFTS_TO_TRANSFER).keys()];
      let NFT_INDEXES: number[] = [];
      for (let i = 0; i < NFTS_TO_TRANSFER; i++) {
        let tokenId = await this.mintNFTWithOwnerAndAdmin();
        NFT_INDEXES.push(tokenId);
      }
      let abiCoder = new ethers.utils.AbiCoder();
      let NFT_AMOUNTS = range.map((_, _i) => 1);
      let IGNORED_DATA = abiCoder.encode([], []);

      await this.tokensAs(this.OWNER).safeBatchTransferFrom(
        this.OWNER.address,
        MockERC1155.address,
        NFT_INDEXES,
        NFT_AMOUNTS,
        IGNORED_DATA
      );
    });

    it('should revert when _doSafeTransferAcceptanceCheck detects non-ERC1155 receiver', async function () {
      // deploy the mock contracts
      let factory = await ethers.getContractFactory('MockERC20', this.CEO);
      let mockERC20 = await factory.deploy('MockToken', 'MKT');
      await mockERC20.deployed();

      let NFTS_TO_TRANSFER = 5;
      let range = [...Array(NFTS_TO_TRANSFER).keys()];
      let NFT_INDEXES: number[] = [];
      for (let i = 0; i < NFTS_TO_TRANSFER; i++) {
        let tokenId = await this.mintNFTWithOwnerAndAdmin();
        NFT_INDEXES.push(tokenId);
      }
      let abiCoder = new ethers.utils.AbiCoder();
      let NFT_AMOUNTS = range.map((_, _i) => 1);
      let IGNORED_DATA = abiCoder.encode([], []);
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).safeBatchTransferFrom(
          this.OWNER.address,
          mockERC20.address,
          NFT_INDEXES,
          NFT_AMOUNTS,
          IGNORED_DATA
        );
      }, 'ERC1155: transfer to non-ERC1155Receiver implementer');
    });

    it('should revert when _doSafeTransferAcceptanceCheck detects ERC1155Receiver rejects transaction', async function () {
      // deploy the mock contracts
      let factory = await ethers.getContractFactory('MockERC1155Rejecting', this.CEO);
      let mockERC1155Receiver = await factory.deploy();
      await mockERC1155Receiver.deployed();

      let NFTS_TO_TRANSFER = 5;
      let range = [...Array(NFTS_TO_TRANSFER).keys()];
      let NFT_INDEXES: number[] = [];
      for (let i = 0; i < NFTS_TO_TRANSFER; i++) {
        let tokenId = await this.mintNFTWithOwnerAndAdmin();
        NFT_INDEXES.push(tokenId);
      }
      let abiCoder = new ethers.utils.AbiCoder();
      let NFT_AMOUNTS = range.map((_, _i) => 1);
      let IGNORED_DATA = abiCoder.encode([], []);
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).safeBatchTransferFrom(
          this.OWNER.address,
          mockERC1155Receiver.address,
          NFT_INDEXES,
          NFT_AMOUNTS,
          IGNORED_DATA
        );
      }, 'ERC1155: ERC1155Receiver rejected tokens');
    });

    it('should revert when _doSafeTransferAcceptanceCheck detects ERC1155Receiver reverts transaction', async function () {
      // deploy the mock contracts
      let factory = await ethers.getContractFactory('MockERC1155Reverting', this.CEO);
      let mockERC1155Receiver = await factory.deploy();
      await mockERC1155Receiver.deployed();

      let NFTS_TO_TRANSFER = 5;
      let range = [...Array(NFTS_TO_TRANSFER).keys()];
      let NFT_INDEXES: number[] = [];
      for (let i = 0; i < NFTS_TO_TRANSFER; i++) {
        let tokenId = await this.mintNFTWithOwnerAndAdmin();
        NFT_INDEXES.push(tokenId);
      }
      let abiCoder = new ethers.utils.AbiCoder();
      let NFT_AMOUNTS = range.map((_, _i) => 1);
      let IGNORED_DATA = abiCoder.encode([], []);
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).safeBatchTransferFrom(
          this.OWNER.address,
          mockERC1155Receiver.address,
          NFT_INDEXES,
          NFT_AMOUNTS,
          IGNORED_DATA
        );
      }, 'contract always reverts');
    });
  });

  describe('batch approvals', function () {
    it('should approve a batch of operators', async function () {
      let operators = [
        this.CEO.address,
        this.CFO.address,
        this.SUPERADMIN.address,
        this.OWNER.address,
        this.ADMIN.address,
        this.BENEFICIARY.address,
        this.LISTINGS_CONTRACT.address,
        this.OFFERS_CONTRACT.address,
      ];
      let approvals = [true, false, true, false, true, false, true, false];

      await this.tokensAs(this.ANYONE).setApprovalForAllBatch(operators, approvals);
      expect(await this.tokens.isApprovedForAll(this.ANYONE.address, operators[0])).to.deep.equal(
        true
      );
      expect(await this.tokens.isApprovedForAll(this.ANYONE.address, operators[1])).to.deep.equal(
        false
      );
      let anyoneRepeated = approvals.map((_) => this.ANYONE.address);
      let contractApprovals = await this.tokensAs(this.ANYONE).isApprovedForAllBatch(
        anyoneRepeated,
        operators
      );
      expect(contractApprovals).to.deep.equal(approvals);
    });

    it('should reject for array length mismatch', async function () {
      await this.toRevert(async () => {
        await this.tokensAs(this.ANYONE).setApprovalForAllBatch(
          [this.CEO.address, this.CFO.address],
          [true, true, false]
        );
      }, 'operators and approvals length mismatch');

      await this.toRevert(async () => {
        await this.tokensAs(this.ANYONE).isApprovedForAllBatch(
          [this.CEO.address, this.CFO.address],
          [this.ANYONE.address]
        );
      }, 'accounts and operators length mismatch');
    });

    it('should reject setting approval for self', async function () {
      await this.toRevert(async () => {
        await this.tokensAs(this.ANYONE).setApprovalForAllBatch([this.ANYONE.address], [true]);
      }, 'ERC1155: setting approval status for self');
    });
  });

  describe('withdrawFees', function () {
    it('should withdraw minting fees as the CFO', async function () {
      let mintingFee = ethers.BigNumber.from(1234567);
      await this.tokensAs(this.CFO).setMintingFee(mintingFee);
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      let initialAnyoneBalance = await this.ANYONE.getBalance();
      await this.tokensAs(this.CFO).withdraw(this.ANYONE.address, mintingFee);
      expect(await this.ANYONE.getBalance()).to.equal(initialAnyoneBalance.add(mintingFee));
    });

    it('should revert on insufficient funds', async function () {
      let mintingFee = ethers.BigNumber.from(1234567);
      await this.tokensAs(this.CFO).setMintingFee(mintingFee);
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });

      await this.toRevert(async () => {
        await this.tokensAs(this.CFO).withdraw(this.ANYONE.address, mintingFee.add(1));
      }, 'Value exceeds balance');
    });

    it('should revert as any other role', async function () {
      let mintingFee = ethers.BigNumber.from(1234567);
      await this.tokensAs(this.CFO).setMintingFee(mintingFee);
      await this.creditSCI(this.OWNER, 99);
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CFO.address);
      let f = async (s: SignerWithAddress) =>
        await this.tokensAs(s).withdraw(this.ANYONE.address, mintingFee);
      let m = 'Only CFO';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('setMintingFee', function () {
    it('should set minting fee as the CFO', async function () {
      await this.tokensAs(this.CFO).setMintingFee(99);
      expect(await this.tokens.mintingFee()).to.equal(99);
    });

    it('should revert as any other role', async function () {
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CFO.address);
      let f = async (s: SignerWithAddress) => await this.tokensAs(s).setMintingFee(99);
      let m = 'Only CFO';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('setMiningFee', function () {
    it('should set mining fee as the CFO', async function () {
      await this.tokensAs(this.CFO).setMiningFee(99);
      expect(await this.tokens.miningFee()).to.equal(99);
    });

    it('should revert as any other role', async function () {
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CFO.address);
      let f = async (s: SignerWithAddress) => await this.tokensAs(s).setMiningFee(99);
      let m = 'Only CFO';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('setDifficulty', function () {
    it('should set difficulty as the CFO', async function () {
      let tx = await this.tokensAs(this.CFO).setDifficulty(99);
      const receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'DifficultySet')).to.not.be.null;
      expect(receipt.events[0].args.difficulty).to.equal(99);

      expect(await this.tokens.difficulty()).to.equal(99);
    });

    it('should accept any value with difficulty = zero', async function () {
      await this.tokensAs(this.CFO).setDifficulty(0);
      for (let i = 0; i < 100; i++) {
        expect(await this.tokens.isCorrect(randomBytes(32))).to.equal(true);
      }
    });

    it('should revert as any other role', async function () {
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CFO.address);
      let f = async (s: SignerWithAddress) => await this.tokensAs(s).setDifficulty(99);
      let m = 'Only CFO';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('setMiningInterval', function () {
    it('should set mining interval as the CFO', async function () {
      let tx = await this.tokensAs(this.CFO).setMiningInterval(99);
      const receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'MiningIntervalSet')).to.not.be.null;
      expect(receipt.events[0].args.interval).to.equal(99);

      expect(await this.tokens.miningIntervalSeconds()).to.equal(99);
    });

    it('should revert mining if interval not satisfied', async function () {
      await this.tokensAs(this.CFO).setMiningInterval(10000);
      let fee = 12345;
      await this.tokensAs(this.CFO).setMiningFee(fee);
      let solution = randomBytes(32);
      let done = false;
      while (!done) {
        solution = randomBytes(32);
        done = await this.tokens.isCorrect(solution);
      }
      let lastTime = BigNumber.from(await time.latest());
      let interval = BigNumber.from(await this.tokensAs(this.ANYONE).miningIntervalSeconds());
      time.setNextBlockTimestamp(lastTime.add(interval).add(1));
      await this.tokensAs(this.ANYONE).mineSCI(solution, this.ANYONE.address, {
        value: BigNumber.from(fee).toString(),
      });

      solution = randomBytes(32);
      done = false;
      while (!done) {
        solution = randomBytes(32);
        done = await this.tokens.isCorrect(solution);
      }
      lastTime = BigNumber.from(await time.latest());
      time.setNextBlockTimestamp(lastTime.add(interval).sub(1000));

      await this.toRevert(async () => {
        await this.tokensAs(this.ANYONE).mineSCI(solution, this.ANYONE.address, {
          value: BigNumber.from(fee).toString(),
        });
      }, 'Mining interval has not elapsed');
    });

    it('should revert as any other role', async function () {
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.CFO.address);
      let f = async (s: SignerWithAddress) => await this.tokensAs(s).setMiningInterval(99);
      let m = 'Only CFO';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('changeAdmin', function () {
    it('should set the ADMIN address to the OWNER address for a new NFT', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      expect(await this.tokens.adminOf(tokenId + 1)).to.equal(this.OWNER.address);
    });

    it('should revert for an NFT that is not minted', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).setAdmin(tokenId + 1, this.ANYONE.address);
      }, 'Invalid NFT');
    });

    it('should change the ADMIN address as the ADMIN', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      expect(await this.tokens.adminOf(tokenId)).to.equal(this.ADMIN.address);
      await this.tokensAs(this.ADMIN).setAdmin(tokenId, this.ANYONE.address);
      expect(await this.tokens.adminOf(tokenId)).to.equal(this.ANYONE.address);
    });

    it('should revert as any other role', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.ADMIN.address);
      let f = async (s: SignerWithAddress) =>
        await this.tokensAs(s).setAdmin(tokenId, this.ANYONE.address);

      let m = 'Only ADMIN';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('changeBeneficiary', function () {
    it('should set the BENEFICIARY address to the OWNER address for a new NFT', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      expect(await this.tokens.beneficiaryOf(tokenId + 1)).to.equal(this.OWNER.address);
    });

    it('should revert for an NFT that is not minted', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).setBeneficiary(tokenId + 1, this.ANYONE.address);
      }, 'Invalid NFT');
    });

    it('should change the BENEFICIARY address as the ADMIN', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      expect(await this.tokens.adminOf(tokenId)).to.equal(this.ADMIN.address);
      await this.tokensAs(this.ADMIN).setBeneficiary(tokenId, this.ANYONE.address);
      expect(await this.tokens.beneficiaryOf(tokenId)).to.equal(this.ANYONE.address);
    });

    it('should revert as any other role', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.ADMIN.address);
      let f = async (s: SignerWithAddress) =>
        await this.tokensAs(s).setBeneficiary(tokenId, this.ANYONE.address);
      let m = 'Only ADMIN';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('appending content', function () {
    it('should set the owner and admin hashes correctly for a new NFT', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      expect((await this.tokens.scienceNFTs(tokenId + 1)).adminHash).to.equal(OWNER_HASH_1);
    });

    it('should revert for an NFT that is not minted', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).appendContent(
          tokenId + 1,
          ADMIN_HASH_2,
          ENUM_ADMIN_CONTENT,
          {
            value: (await this.tokens.mintingFee()).toString(),
          }
        );
      }, 'Invalid NFT');
    });

    it('should revert in getAdjacentContent for invalid conditions', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();

      await this.toRevert(async () => {
        await this.tokens.getAdjacentContent(tokenId + 1, ADMIN_HASH_1, ENUM_ADMIN_CONTENT);
      }, 'Invalid NFT');

      await this.toRevert(async () => {
        await this.tokens.getAdjacentContent(tokenId, OWNER_HASH_1, ENUM_ADMIN_CONTENT);
      }, 'Content not found');

      await this.toRevert(async () => {
        await this.tokens.getAdjacentContent(tokenId, ZERO_HASH, ENUM_ADMIN_CONTENT);
      }, 'Invalid content');
    });

    it('should revert in appendContent for invalid conditions', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();

      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).appendContent(tokenId, ADMIN_HASH_2, ENUM_ADMIN_CONTENT, {
          value: ((await this.tokens.mintingFee()) + 1).toString(),
          gasLimit: 250000,
        });
      }, 'Wrong minting fee');

      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).appendContent(
          tokenId + 1,
          ADMIN_HASH_2,
          ENUM_ADMIN_CONTENT,
          {
            value: (await this.tokens.mintingFee()).toString(),
            gasLimit: 250000,
          }
        );
      }, 'Invalid NFT');

      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).appendContent(tokenId, ZERO_HASH, ENUM_ADMIN_CONTENT, {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 250000,
        });
      }, 'Invalid content');

      expect((await this.tokens.scienceNFTs(tokenId)).adminHash).to.equal(ADMIN_HASH_1);
      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).appendContent(tokenId, ADMIN_HASH_1, ENUM_ADMIN_CONTENT, {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 250000,
        });
      }, 'Duplicate content');
    });

    it('should revert in appendContent for duplicate appended content', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();

      expect((await this.tokens.scienceNFTs(tokenId)).adminHash).to.equal(ADMIN_HASH_1);

      await this.tokensAs(this.ADMIN).appendContent(tokenId, ADMIN_HASH_2, ENUM_ADMIN_CONTENT, {
        value: (await this.tokens.mintingFee()).toString(),
        gasLimit: 250000,
      });
      let [prev, next] = await this.tokens.getAdjacentContent(
        tokenId,
        ADMIN_HASH_1,
        ENUM_ADMIN_CONTENT
      );
      expect(prev).to.equal(ZERO_HASH);
      expect(next).to.equal(ADMIN_HASH_2);

      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).appendContent(tokenId, ADMIN_HASH_1, ENUM_ADMIN_CONTENT, {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 250000,
        });
      }, 'Duplicate content');

      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).appendContent(tokenId, ADMIN_HASH_2, ENUM_ADMIN_CONTENT, {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 250000,
        });
      }, 'Duplicate content');

      await this.tokensAs(this.ADMIN).appendContent(tokenId, ADMIN_HASH_3, ENUM_ADMIN_CONTENT, {
        value: (await this.tokens.mintingFee()).toString(),
        gasLimit: 250000,
      });

      [prev, next] = await this.tokens.getAdjacentContent(
        tokenId,
        ADMIN_HASH_2,
        ENUM_ADMIN_CONTENT
      );
      expect(prev).to.equal(ADMIN_HASH_1);
      expect(next).to.equal(ADMIN_HASH_3);

      [prev, next] = await this.tokens.getAdjacentContent(
        tokenId,
        ADMIN_HASH_3,
        ENUM_ADMIN_CONTENT
      );
      expect(prev).to.equal(ADMIN_HASH_2);
      expect(next).to.equal(ZERO_HASH);

      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).appendContent(tokenId, ADMIN_HASH_2, ENUM_ADMIN_CONTENT, {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 250000,
        });
      }, 'Duplicate content');

      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).appendContent(tokenId, ADMIN_HASH_3, ENUM_ADMIN_CONTENT, {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 250000,
        });
      }, 'Duplicate content');
    });

    it('should emit events as expected for OwnerContentNodeCreated', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();

      let tx1 = await this.tokensAs(this.OWNER).appendContent(
        tokenId,
        OWNER_HASH_1,
        ENUM_OWNER_CONTENT,
        {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 250000,
        }
      );

      const r1 = await tx1.wait();

      expect(r1.events?.filter((x: Event) => x.event == 'OwnerContentNodeCreated')).to.not.be.null;

      //expect(tx1).to.emit(this.tokens, 'OwnerContentNodeCreated').withArgs(tokenId, OWNER_HASH_1, ZERO_HASH);
      // I struggled with this for several hours trying to debug. As far as I can tell
      // the ".to.emit().withArgs()" pattern gives false positives (i.e. misses bugs!)
      // when testing events. After that experience I decided to replace all withArgs
      // with this alternative pattern

      expect(r1.events[0].args.prev).to.equal(ZERO_HASH);
      expect(r1.events[0].args.data).to.equal(OWNER_HASH_1);

      let tx2 = await this.tokensAs(this.OWNER).appendContent(
        tokenId,
        OWNER_HASH_2,
        ENUM_OWNER_CONTENT,
        {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 250000,
        }
      );
      const r2 = await tx2.wait();
      expect(r2.events?.filter((x: Event) => x.event == 'OwnerContentNodeCreated')).to.not.be.null;
      expect(r2.events[0].args.prev).to.equal(OWNER_HASH_1);
      expect(r2.events[0].args.data).to.equal(OWNER_HASH_2);

      const createdAt = BigNumber.from(1668162853);
      let tx3 = await this.tokensAs(this.SUPERADMIN).superadminAppendContent(
        tokenId,
        OWNER_HASH_3,
        ENUM_OWNER_CONTENT,
        createdAt,
        {
          gasLimit: 250000,
        }
      );
      const r3 = await tx3.wait();
      expect(r3.events?.filter((x: Event) => x.event == 'OwnerContentNodeCreated')).to.not.be.null;
      expect(r3.events[0].args.prev).to.equal(OWNER_HASH_2);
      expect(r3.events[0].args.data).to.equal(OWNER_HASH_3);
    });

    it('should emit events as expected for AdminContentNodeCreated', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();

      let tx = await this.tokensAs(this.ADMIN).appendContent(
        tokenId,
        ADMIN_HASH_2,
        ENUM_ADMIN_CONTENT,
        {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 250000,
        }
      );
      let receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'AdminContentNodeCreated')).to.not.be
        .null;
      expect(receipt.events[0].args.prev).to.equal(ADMIN_HASH_1);
      expect(receipt.events[0].args.data).to.equal(ADMIN_HASH_2);

      const createdAt = BigNumber.from(1668162853);

      tx = await this.tokensAs(this.SUPERADMIN).superadminAppendContent(
        tokenId,
        ADMIN_HASH_3,
        ENUM_ADMIN_CONTENT,
        createdAt,
        {
          gasLimit: 250000,
        }
      );
      receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'AdminContentNodeCreated')).to.not.be
        .null;
      expect(receipt.events[0].args.prev).to.equal(ADMIN_HASH_2);
      expect(receipt.events[0].args.data).to.equal(ADMIN_HASH_3);
    });

    it('should add new adminHash values as the ADMIN', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      expect(await this.tokens.adminOf(tokenId)).to.equal(this.ADMIN.address);
      expect((await this.tokens.scienceNFTs(tokenId)).adminHash).to.equal(ADMIN_HASH_1);

      let [prev, next] = await this.tokens.getAdjacentContent(
        tokenId,
        ADMIN_HASH_1,
        ENUM_ADMIN_CONTENT
      );
      expect(prev).to.equal(ZERO_HASH);
      expect(next).to.equal(ZERO_HASH);

      await this.tokensAs(this.ADMIN).appendContent(tokenId, ADMIN_HASH_2, ENUM_ADMIN_CONTENT, {
        value: (await this.tokens.mintingFee()).toString(),
        gasLimit: 250000,
      });

      // should not change heads
      expect((await this.tokens.scienceNFTs(tokenId)).adminHash).to.equal(ADMIN_HASH_1);

      [prev, next] = await this.tokens.getAdjacentContent(
        tokenId,
        ADMIN_HASH_1,
        ENUM_ADMIN_CONTENT
      );
      expect(prev).to.equal(ZERO_HASH);
      expect(next).to.equal(ADMIN_HASH_2);

      [prev, next] = await this.tokens.getAdjacentContent(
        tokenId,
        ADMIN_HASH_2,
        ENUM_ADMIN_CONTENT
      );
      expect(prev).to.equal(ADMIN_HASH_1);
      expect(next).to.equal(ZERO_HASH);
    });

    it('should add new ownerHash values as the OWNER', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();

      expect((await this.tokens.scienceNFTs(tokenId)).adminHash).to.equal(ADMIN_HASH_1);
      let [prev, next] = await this.tokens.getAdjacentContent(
        tokenId,
        ADMIN_HASH_1,
        ENUM_ADMIN_CONTENT
      );
      expect(prev).to.equal(ZERO_HASH);
      expect(next).to.equal(ZERO_HASH);

      await this.toRevert(async () => {
        await this.tokens.getAdjacentContent(tokenId, OWNER_HASH_1, ENUM_OWNER_CONTENT);
      }, 'Content not found');

      let tx = await this.tokensAs(this.OWNER).appendContent(
        tokenId,
        OWNER_HASH_1,
        ENUM_OWNER_CONTENT,
        {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 250000,
        }
      );
      let receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'OwnerContentNodeCreated')).to.not.be
        .null;
      expect(receipt.events[0].args.prev).to.equal(ZERO_HASH);
      expect(receipt.events[0].args.data).to.equal(OWNER_HASH_1);

      expect((await this.tokens.scienceNFTs(tokenId)).adminHash).to.equal(ADMIN_HASH_1);

      [prev, next] = await this.tokens.getAdjacentContent(
        tokenId,
        OWNER_HASH_1,
        ENUM_OWNER_CONTENT
      );
      expect(prev).to.equal(ZERO_HASH);
      expect(next).to.equal(ZERO_HASH);

      [prev, next] = await this.tokens.getAdjacentContent(
        tokenId,
        ADMIN_HASH_1,
        ENUM_ADMIN_CONTENT
      );
      expect(prev).to.equal(ZERO_HASH);
      expect(next).to.equal(ZERO_HASH);

      tx = await this.tokensAs(this.OWNER).appendContent(
        tokenId,
        OWNER_HASH_2,
        ENUM_OWNER_CONTENT,
        {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 250000,
        }
      );
      receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'OwnerContentNodeCreated')).to.not.be
        .null;
      expect(receipt.events[0].args.prev).to.equal(OWNER_HASH_1);
      expect(receipt.events[0].args.data).to.equal(OWNER_HASH_2);

      expect((await this.tokens.scienceNFTs(tokenId)).adminHash).to.equal(ADMIN_HASH_1);

      [prev, next] = await this.tokens.getAdjacentContent(
        tokenId,
        OWNER_HASH_2,
        ENUM_OWNER_CONTENT
      );
      expect(prev).to.equal(OWNER_HASH_1);
      expect(next).to.equal(ZERO_HASH);

      tx = await this.tokensAs(this.OWNER).appendContent(
        tokenId,
        OWNER_HASH_3,
        ENUM_OWNER_CONTENT,
        {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 250000,
        }
      );
      receipt = await tx.wait();
      expect(receipt.events?.filter((x: Event) => x.event == 'OwnerContentNodeCreated')).to.not.be
        .null;
      expect(receipt.events[0].args.prev).to.equal(OWNER_HASH_2);
      expect(receipt.events[0].args.data).to.equal(OWNER_HASH_3);

      [prev, next] = await this.tokens.getAdjacentContent(
        tokenId,
        OWNER_HASH_1,
        ENUM_OWNER_CONTENT
      );
      expect(prev).to.equal(ZERO_HASH);
      expect(next).to.equal(OWNER_HASH_2);

      [prev, next] = await this.tokens.getAdjacentContent(
        tokenId,
        OWNER_HASH_2,
        ENUM_OWNER_CONTENT
      );
      expect(prev).to.equal(OWNER_HASH_1);
      expect(next).to.equal(OWNER_HASH_3);

      [prev, next] = await this.tokens.getAdjacentContent(
        tokenId,
        OWNER_HASH_3,
        ENUM_OWNER_CONTENT
      );
      expect(prev).to.equal(OWNER_HASH_2);
      expect(next).to.equal(ZERO_HASH);
    });

    it('should append to the admin list as the SUPERADMIN', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      const createdAt = BigNumber.from(1668162853);

      let tokens = this.tokensAs(this.SUPERADMIN);

      let appendAdmin = async (data, prev) => {
        let tx = await tokens.superadminAppendContent(
          tokenId,
          data,
          ENUM_ADMIN_CONTENT,
          createdAt,
          {
            gasLimit: 300000,
          }
        );
        let receipt = await tx.wait();
        expect(receipt.events?.filter((x: Event) => x.event == 'AdminContentNodeCreated')).to.not.be
          .null;
        expect(receipt.events[0].args.prev).to.equal(prev);
        expect(receipt.events[0].args.data).to.equal(data);

        expect((await this.tokens.scienceNFTs(tokenId)).adminHash).to.equal(ADMIN_HASH_1);

        let [p, n] = await this.tokens.getAdjacentContent(tokenId, data, ENUM_ADMIN_CONTENT);
        expect(p).to.equal(prev);
        expect(n).to.equal(ZERO_HASH);
      };

      let appendOwner = async (data, prev) => {
        let tx = await tokens.superadminAppendContent(
          tokenId,
          data,
          ENUM_OWNER_CONTENT,
          createdAt,
          {
            gasLimit: 300000,
          }
        );
        let receipt = await tx.wait();
        expect(receipt.events?.filter((x: Event) => x.event == 'OwnerContentNodeCreated')).to.not.be
          .null;
        expect(receipt.events[0].args.prev).to.equal(prev);
        expect(receipt.events[0].args.data).to.equal(data);

        expect((await this.tokens.scienceNFTs(tokenId)).adminHash).to.equal(ADMIN_HASH_1);

        let [p, n] = await this.tokens.getAdjacentContent(tokenId, data, ENUM_OWNER_CONTENT);
        expect(p).to.equal(prev);
        expect(n).to.equal(ZERO_HASH);
      };

      await appendOwner(OWNER_HASH_1, ZERO_HASH);
      await appendOwner(OWNER_HASH_2, OWNER_HASH_1);
      await appendOwner(OWNER_HASH_3, OWNER_HASH_2);

      await appendAdmin(ADMIN_HASH_2, ADMIN_HASH_1);
      await appendAdmin(ADMIN_HASH_3, ADMIN_HASH_2);

      let [p, n] = await this.tokens.getAdjacentContent(tokenId, OWNER_HASH_1, ENUM_OWNER_CONTENT);
      expect(p).to.equal(ZERO_HASH);
      expect(n).to.equal(OWNER_HASH_2);

      [p, n] = await this.tokens.getAdjacentContent(tokenId, OWNER_HASH_2, ENUM_OWNER_CONTENT);
      expect(p).to.equal(OWNER_HASH_1);
      expect(n).to.equal(OWNER_HASH_3);

      [p, n] = await this.tokens.getAdjacentContent(tokenId, OWNER_HASH_3, ENUM_OWNER_CONTENT);
      expect(p).to.equal(OWNER_HASH_2);
      expect(n).to.equal(ZERO_HASH);

      [p, n] = await this.tokens.getAdjacentContent(tokenId, ADMIN_HASH_1, ENUM_ADMIN_CONTENT);
      expect(p).to.equal(ZERO_HASH);
      expect(n).to.equal(ADMIN_HASH_2);

      [p, n] = await this.tokens.getAdjacentContent(tokenId, ADMIN_HASH_2, ENUM_ADMIN_CONTENT);
      expect(p).to.equal(ADMIN_HASH_1);
      expect(n).to.equal(ADMIN_HASH_3);

      [p, n] = await this.tokens.getAdjacentContent(tokenId, ADMIN_HASH_3, ENUM_ADMIN_CONTENT);
      expect(p).to.equal(ADMIN_HASH_2);
      expect(n).to.equal(ZERO_HASH);
    });

    it('should revert superadminAppend as the SUPERADMIN when checks fail', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      expect((await this.tokens.scienceNFTs(tokenId)).adminHash).to.equal(ADMIN_HASH_1);

      expect(await this.tokens.adminOf(tokenId)).to.equal(this.ADMIN.address);
      const createdAt = BigNumber.from(1668162853);

      await this.toRevert(async () => {
        await this.tokensAs(this.SUPERADMIN).superadminAppendContent(
          tokenId + 1,
          ADMIN_HASH_2,
          ENUM_ADMIN_CONTENT,
          createdAt,
          {
            gasLimit: 300000,
          }
        );
      }, 'Invalid NFT');

      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      await this.toRevert(async () => {
        await this.tokensAs(this.SUPERADMIN).superadminAppendContent(
          tokenId,
          ADMIN_HASH_2,
          ENUM_ADMIN_CONTENT,
          createdAt,
          {
            gasLimit: 300000,
          }
        );
      }, 'NFT is bridged');
    });

    it('should revert superadminAppendContent as any other role', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.SUPERADMIN.address);
      let f = async (s: SignerWithAddress) =>
        await this.tokensAs(s).superadminAppendContent(
          tokenId,
          ADMIN_HASH_2,
          ENUM_ADMIN_CONTENT,
          BigNumber.from(1668162853),
          {
            gasLimit: 300000,
          }
        );
      let m = 'Only SUPERADMIN';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });

    it('should revert appendContent any other role', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      let allSigners = await ethers.getSigners();
      // admin list
      let notAllowed = allSigners.filter((s) => s.address != this.ADMIN.address);
      let f = async (s: SignerWithAddress) =>
        await this.tokensAs(s).appendContent(tokenId, ADMIN_HASH_2, ENUM_ADMIN_CONTENT, {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 300000,
        });
      let m = 'Only ADMIN';
      expect(await this.checkAllRoles(notAllowed, f, m));

      // check owner list
      notAllowed = allSigners.filter((s) => s.address != this.OWNER.address);
      f = async (s: SignerWithAddress) =>
        await this.tokensAs(s).appendContent(tokenId, OWNER_HASH_2, ENUM_OWNER_CONTENT, {
          value: (await this.tokens.mintingFee()).toString(),
          gasLimit: 300000,
        });
      m = 'Only OWNER';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('Retracted Flag', function () {
    it('should set the retracted bit to false for a new NFT', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      expect(await this.tokens.isBlocklisted(tokenId + 1)).to.equal(false);
    });

    it('should change the retracted bit as the SUPERADMIN', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.SUPERADMIN).blocklist(tokenId, true);
      expect(await this.tokens.isBlocklisted(tokenId)).to.equal(true);
      await this.tokensAs(this.SUPERADMIN).blocklist(tokenId, false);
      expect(await this.tokens.isBlocklisted(tokenId)).to.equal(false);
    });

    it('should revert for an NFT that is not minted', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.toRevert(async () => {
        await this.tokensAs(this.SUPERADMIN).blocklist(tokenId + 1, true);
      }, 'Invalid NFT');
    });

    it('should revert as any other role', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.SUPERADMIN.address);
      let f = async (s: SignerWithAddress) => await this.tokensAs(s).blocklist(tokenId, true);
      let m = 'Only SUPERADMIN';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('Full Benefit Flag', function () {
    it('should set the full benefit flag bit to true for a new NFT', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      expect(await this.tokens.isFullBenefit(tokenId + 1)).to.equal(true);
    });

    it('should revert for an NFT that is not minted', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).setFullBenefitFlag(tokenId + 1, false);
      }, 'Invalid NFT');
    });

    it('should change the full benefit flag bit as the OWNER', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      expect(await this.tokens.isFullBenefit(tokenId)).to.equal(true);
      await this.tokensAs(this.OWNER).setFullBenefitFlag(tokenId, false);
      expect(await this.tokens.isFullBenefit(tokenId)).to.equal(false);
      await this.tokensAs(this.OWNER).setFullBenefitFlag(tokenId, true);
      expect(await this.tokens.isFullBenefit(tokenId)).to.equal(true);
    });

    it('should revert as any other role', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.OWNER.address);
      let f = async (s: SignerWithAddress) =>
        await this.tokensAs(s).setFullBenefitFlag(tokenId, true);
      let m = 'Only OWNER';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('UNSET_FULL_BENEFIT_FLAG', function () {
    it('should set UNSET_FULL_BENEFIT_FLAG to true for a new NFT', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      expect(await this.tokens.willUnsetFullBenefit(tokenId + 1)).to.equal(true);
    });
  });

  describe('BRIDGED_FLAG', function () {
    it('should set the bridged bit to false for a new NFT', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      expect(await this.tokens.isBridged(tokenId)).to.equal(false);
    });

    it('should change the bridged bit as the OWNER', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      expect(await this.tokens.isBridged(tokenId)).to.equal(true);
    });

    it('should revert as any other role', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.OWNER.address);
      let f = async (s: SignerWithAddress) =>
        await this.tokensAs(s).withdrawFromContract(tokenId, this.BRIDGE.address);

      let m = 'Only OWNER';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });

    it('should revert transfer when bridged', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      expect(await this.tokens.isBridged(tokenId)).to.equal(true);

      await this.toRevert(async () => {
        await this.tokensAs(this.BRIDGE).safeTransferFrom(
          this.BRIDGE.address,
          this.OWNER.address,
          tokenId,
          1,
          []
        );
      }, 'NFT is bridged');
    });

    it('should revert batch transfer when bridged', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      expect(await this.tokens.isBridged(tokenId)).to.equal(true);

      await this.toRevert(async () => {
        await this.tokensAs(this.BRIDGE).safeBatchTransferFrom(
          this.BRIDGE.address,
          this.OWNER.address,
          [tokenId],
          [1],
          []
        );
      }, 'NFT is bridged');
    });

    it('should revert set status when bridged', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      expect(await this.tokens.isBridged(tokenId)).to.equal(true);

      await this.toRevert(async () => {
        await this.tokensAs(this.SUPERADMIN).setStatus(
          tokenId,
          '0x' + randomBytes(24).toString('hex')
        );
      }, 'NFT is bridged');
    });

    it('should revert change Admin when bridged', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      expect(await this.tokens.isBridged(tokenId)).to.equal(true);

      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).setAdmin(tokenId, this.CEO.address);
      }, 'NFT is bridged');
    });

    it('should revert change Beneficiary when bridged', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      expect(await this.tokens.isBridged(tokenId)).to.equal(true);
      expect(await this.tokens.isMinted(tokenId)).to.be.equal(true);
      expect(await this.tokens.isMinted(tokenId + 1)).to.be.equal(false);

      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).setBeneficiary(tokenId, this.CEO.address);
      }, 'NFT is bridged');
    });

    it('should revert appendContent when bridged', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      expect(await this.tokens.isBridged(tokenId)).to.equal(true);

      await this.toRevert(async () => {
        await this.tokensAs(this.ADMIN).appendContent(tokenId, ADMIN_HASH_2, ENUM_ADMIN_CONTENT, {
          value: (await this.tokens.mintingFee()).toString(),
        });
      }, 'NFT is bridged');
    });

    it('should revert retract NFT when bridged', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      expect(await this.tokens.isBridged(tokenId)).to.equal(true);

      await this.toRevert(async () => {
        await this.tokensAs(this.SUPERADMIN).blocklist(tokenId, true);
      }, 'NFT is bridged');
    });

    it('should revert set full benefit flag when bridged', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      expect(await this.tokens.isBridged(tokenId)).to.equal(true);

      // token has been transferred to bridge!
      expect(await this.tokens['balanceOf(address,uint256)'](this.OWNER.address, tokenId)).to.equal(
        0
      );
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).setFullBenefitFlag(tokenId, true);
      }, 'Only OWNER');

      // try it as the current owner (BRIDGE)
      await this.toRevert(async () => {
        await this.tokensAs(this.BRIDGE).setFullBenefitFlag(tokenId, true);
      }, 'NFT is bridged');
    });
  });

  describe('a signer acting as a BRIDGE', function () {
    it('should revert for an NFT that is not minted', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).withdrawFromContract(tokenId + 1, this.BRIDGE.address);
      }, 'Invalid NFT');
    });

    it('should revert trying to move to an invalid bridge', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.CEO.address);
      }, 'Invalid BRIDGE');
    });

    it('should revert if NFT is already bridged', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      await this.toRevert(async () => {
        await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      }, 'NFT is bridged');
    });

    it('should revert restoring to contract when expecting failure', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      const createdAt = BigNumber.from(1668162853);
      let status = BigNumber.from(0xfffffff);

      // require NFT to be on bridge
      await this.toRevert(async () => {
        await this.tokensAs(this.BRIDGE).restoreToContract(
          tokenId,
          status,
          this.CEO.address, // new owner
          this.CFO.address, // new admin
          this.OWNER.address // new beneficiary
        );
      }, 'NFT is not bridged');

      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);

      // require NFT to be minted
      await this.toRevert(async () => {
        await this.tokensAs(this.BRIDGE).restoreToContract(
          tokenId + 1,
          status,
          this.CEO.address, // new owner
          this.CFO.address, // new admin
          this.OWNER.address // new beneficiary
        );
      }, 'Invalid NFT');

      // require BRIDGE role
      await this.toRevert(async () => {
        await this.tokensAs(this.CEO).restoreToContract(
          tokenId,
          status,
          this.CEO.address, // new owner
          this.CFO.address, // new admin
          this.OWNER.address // new beneficiary
        );
      }, 'Only BRIDGE');

      let address0 = '0x0000000000000000000000000000000000000000';

      // do not allow burning
      await this.toRevert(async () => {
        await this.tokensAs(this.BRIDGE).restoreToContract(
          tokenId,
          status,
          address0, // new owner
          this.CFO.address, // new admin
          this.OWNER.address // new beneficiary
        );
      }, 'Invalid OWNER: transfer to the zero address');
    });

    it('should withdraw and restore an NFT with arbitrary values as the BRIDGE', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      // mint a few NFTs
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      tokenId++;
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      tokenId++;
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      tokenId++;

      const createdAt = (await this.tokens.scienceNFTs(tokenId)).createdAt;

      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      expect(await this.tokens.isBridged(tokenId)).to.equal(true);

      // BRIDGE_FLAG should be forced false during restore
      let status = BigNumber.from(0xfffffff | (await this.tokens.BRIDGED_FLAG()));
      await this.tokensAs(this.BRIDGE).restoreToContract(
        tokenId,
        status,
        this.CEO.address, // new owner
        this.CFO.address, // new admin
        this.OWNER.address // new beneficiary
      );

      let expectedStatus = BigNumber.from(0xfffffff & ~(await this.tokens.BRIDGED_FLAG()));

      expect(await this.tokens['balanceOf(address,uint256)'](this.CEO.address, tokenId)).to.equal(
        1
      );

      expect((await this.tokens.scienceNFTs(tokenId)).adminHash).to.equal(OWNER_HASH_1);
      expect((await this.tokens.scienceNFTs(tokenId)).status).to.equal(expectedStatus);
      expect((await this.tokens.scienceNFTs(tokenId)).createdAt).to.equal(createdAt);
      expect(await this.tokens.adminOf(tokenId)).to.equal(this.CFO.address);
      expect(await this.tokens.beneficiaryOf(tokenId)).to.equal(this.OWNER.address);
      expect(await this.tokens.isBridged(tokenId)).to.equal(false);
    });

    it('should revert as any other role', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER).withdrawFromContract(tokenId, this.BRIDGE.address);
      expect(await this.tokens.isBridged(tokenId)).to.equal(true);

      const createdAt = BigNumber.from(1668162853);
      let status = 289087;

      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.BRIDGE.address);
      let f = async (s: SignerWithAddress) =>
        await this.tokensAs(s).restoreToContract(
          tokenId,
          status,
          this.CEO.address, //owner
          this.CFO.address, //admin
          this.OWNER.address //beneficiary
        );
      let m = 'Only BRIDGE';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('reportMarketplaceSale', function () {
    it('should receive from MARKETPLACE', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();

      // use the BRIDGE signer for our marketplace
      let MARKETPLACE: SignerWithAddress = this.BRIDGE;
      await this.tokensAs(this.CEO).grantRole(
        await this.tokens.MARKETPLACE_ROLE(),
        MARKETPLACE.address
      );
      const soldAt = BigNumber.from(1668162853);
      let tx = await this.tokensAs(MARKETPLACE).reportMarketplaceSale(
        tokenId,
        soldAt, // soldAt
        this.ANYONE.address, //buyer
        100, //price
        this.OWNER.address, //seller
        this.CFO.address, // beneficiary
        25 // royalty paid
      );
      let receipt = await tx.wait();

      expect(receipt.events?.filter((x: Event) => x.event == 'NFTUpdated')).to.not.be.null;
      expect(receipt.events?.filter((x: Event) => x.event == 'MarketplaceSale')).to.not.be.null;

      // the NFTUpdated event is emitted because we remove the
      // FULL_BENEFIT_FLAG after a marketplace sale when UNSET_FULL_BENEFIT_FLAG is true
      let NFTUpdatedEvent = receipt.events.find((e: any) => e.event == 'NFTUpdated');
      expect(NFTUpdatedEvent.args.tokenId).to.equal(tokenId);
      expect(NFTUpdatedEvent.args.status).to.equal(0); // status bits have been cleared
      expect(NFTUpdatedEvent.args.owner).to.equal(await this.OWNER.getAddress());
      expect(NFTUpdatedEvent.args.admin).to.equal(await this.ADMIN.getAddress());
      expect(NFTUpdatedEvent.args.beneficiary).to.equal(await this.OWNER.getAddress());

      let marketplaceSaleEvent = receipt.events.find((e: any) => e.event == 'MarketplaceSale');
      expect(marketplaceSaleEvent.args.tokenId).to.equal(tokenId);
      expect(marketplaceSaleEvent.args.soldAt).to.equal(soldAt);
      expect(marketplaceSaleEvent.args.buyer).to.equal(this.ANYONE.address);
      expect(marketplaceSaleEvent.args.price).to.equal(100);
      expect(marketplaceSaleEvent.args.seller).to.equal(this.OWNER.address);
      expect(marketplaceSaleEvent.args.beneficiary).to.equal(this.CFO.address);
      expect(marketplaceSaleEvent.args.royalty).to.equal(25);
    });

    it('should revert as any other role', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      tokenId++;

      // use the BRIDGE signer for our marketplace
      let MARKETPLACE: SignerWithAddress = this.BRIDGE;
      await this.tokensAs(this.CEO).grantRole(
        await this.tokens.MARKETPLACE_ROLE(),
        MARKETPLACE.address
      );

      // based on https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
      async function asyncFilter<T>(arr: T[], predicate: (s: T) => Promise<boolean>) {
        return Promise.all(arr.map(predicate)).then((results) =>
          arr.filter((_v, index) => results[index])
        );
      }

      let marketplaceRole = await this.tokens.MARKETPLACE_ROLE();
      let allSigners = await ethers.getSigners();
      let notAllowed = await asyncFilter(
        allSigners,
        async (s: SignerWithAddress) => !(await this.tokens.hasRole(marketplaceRole, s.address))
      );
      let f = async (s: SignerWithAddress) =>
        await this.tokensAs(s).reportMarketplaceSale(
          tokenId,
          BigNumber.from(1668162853),
          this.ANYONE.address,
          100,
          this.OWNER.address,
          this.CFO.address,
          25
        );
      let m = 'Only MARKETPLACE';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });

  describe('setStatus', function () {
    it('should change status as the SUPERADMIN', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      tokenId++;

      let arbitraryLongStatus = BigNumber.from('0xdeadbeefdeadbeefdeadbeef');
      let bridgeFlag = BigNumber.from(await this.tokens.BRIDGED_FLAG());
      let status1 = arbitraryLongStatus.shl(bridgeFlag.toNumber()); // this forces BRIDGED_FLAG to zero

      await this.tokensAs(this.SUPERADMIN).setStatus(tokenId, status1);
      expect((await this.tokens.scienceNFTs(tokenId)).status).to.equal(status1);

      let status2 = '0x' + randomBytes(24).toString('hex');
      await this.tokensAs(this.SUPERADMIN).setStatus(tokenId, status2);
      expect((await this.tokens.scienceNFTs(tokenId)).status).to.equal(status2);
    });

    it('should revert for an NFT that is not minted', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.toRevert(async () => {
        // should allow up to 48 hex chars
        await this.tokensAs(this.SUPERADMIN).setStatus(
          tokenId + 1,
          '0x' + randomBytes(24).toString('hex')
        );
      }, 'Invalid NFT');
    });

    it('should revert as any other role', async function () {
      let tokenId = await this.mintNFTWithOwnerAndAdmin();
      await this.tokensAs(this.OWNER)['mintNFT(bytes32)'](OWNER_HASH_1, {
        value: (await this.tokens.mintingFee()).toString(),
      });
      tokenId++;
      let status = BigNumber.from(0xdeadbeef);

      let allSigners = await ethers.getSigners();
      let notAllowed = allSigners.filter((s) => s.address != this.SUPERADMIN.address);
      let f = async (s: SignerWithAddress) => await this.tokensAs(s).setStatus(tokenId, status);
      let m = 'Only SUPERADMIN';
      expect(await this.checkAllRoles(notAllowed, f, m));
    });
  });
});

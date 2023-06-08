// Adapted from https://github.com/mancze/token-test-suite

import { expect } from "chai";

import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { randomBytes } from "crypto";

import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployERC20Fixture } from "./ERC20.fixture";
import { BigNumber, Contract } from "ethers";

function when(name: string) {
  return "when (" + name + ")";
}

const amountFromSCI = function (amount: number) {
  return BigNumber.from(amount).mul(BigNumber.from(10).pow(18));
};

const options = { name: "ScieNFT Utility Token", symbol: "SCI", decimals: 18 };

describe("Tokens IERC20 Implementation", function () {
  beforeEach(async function () {
    const { CEO, CFO, ALICE, BOB, CHARLES, EVERYONE, tokens } =
      await loadFixture(deployERC20Fixture);
    this.tokens = tokens;
    this.CEO = CEO;
    this.CFO = CFO;
    this.ALICE = ALICE;
    this.BOB = BOB;
    this.CHARLES = CHARLES;
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

    this.balanceSCIforAddress = (address: string): Promise<BigNumber> =>
      this.tokens["balanceOf(address,uint256)"](address, this.tokens.SCI());

    this.balanceSCI = (s: SignerWithAddress): Promise<BigNumber> =>
      this.balanceSCIforAddress(s.address);

    this.creditSCIToAddress = async (address: string, amount: BigNumber) => {
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
      let interval = BigNumber.from(
        await this.tokensAs(this.CFO).miningIntervalSeconds()
      );
      time.setNextBlockTimestamp(lastTime.add(interval).add(1));
      await this.tokens.mineSCI(solution, this.CFO.address, {
        value: BigNumber.from(fee).toString(),
      });

      await this.tokensAs(this.CFO).transfer(address, amount);

      // burn the rest
      let extra = await this.balanceSCI(this.CFO);
      await this.tokensAs(this.CFO).burn(extra);
    };

    this.creditSCI = async (s: SignerWithAddress, amount: BigNumber) =>
      this.creditSCIToAddress(s.address, amount);
  });

  describe("ERC-20", function () {
    describe("totalSupply()", function () {
      it(
        "should have initial supply of " + BigNumber.from(0).toString(),
        async function () {
          expect(await this.tokens.totalSupply()).to.be.equal(
            BigNumber.from(0)
          );
        }
      ).timeout(10000);

      it("should return the correct supply", async function () {
        await this.creditSCI(this.ALICE, amountFromSCI(1));
        expect(await this.tokens.totalSupply()).to.be.equal(
          BigNumber.from(0).add(amountFromSCI(1))
        );

        await this.creditSCI(this.ALICE, amountFromSCI(2));
        expect(await this.tokens.totalSupply()).to.be.equal(
          BigNumber.from(0).add(amountFromSCI(3))
        );

        await this.creditSCI(this.BOB, amountFromSCI(3));
        expect(await this.tokens.totalSupply()).to.be.equal(
          BigNumber.from(0).add(amountFromSCI(6))
        );
      });

      it("should track the supply correct as tokens are burned", async function () {
        let supply = BigNumber.from(0);

        await this.creditSCI(this.ALICE, amountFromSCI(4));
        supply = supply.add(amountFromSCI(4));
        expect(await this.tokens.totalSupply()).to.be.equal(supply);

        await this.creditSCI(this.BOB, amountFromSCI(4));
        supply = supply.add(amountFromSCI(4));
        expect(await this.tokens.totalSupply()).to.be.equal(supply);

        await this.creditSCI(this.CHARLES, amountFromSCI(4));
        supply = supply.add(amountFromSCI(4));
        expect(await this.tokens.totalSupply()).to.be.equal(supply);

        await this.tokensAs(this.ALICE).burn(amountFromSCI(2));
        supply = supply.sub(amountFromSCI(2));
        expect(await this.tokens.totalSupply()).to.be.equal(supply);

        await this.tokensAs(this.BOB).burn(amountFromSCI(2));
        supply = supply.sub(amountFromSCI(2));
        expect(await this.tokens.totalSupply()).to.be.equal(supply);

        await this.tokensAs(this.CHARLES).burn(amountFromSCI(2));
        supply = supply.sub(amountFromSCI(2));
        expect(await this.tokens.totalSupply()).to.be.equal(supply);
      });

      it("should revert a burn that exceeds balance", async function () {
        await this.creditSCI(this.ALICE, amountFromSCI(1));
        expect(await this.tokens.totalSupply()).to.be.equal(
          BigNumber.from(0).add(amountFromSCI(1))
        );

        await this.toRevert(async () => {
          await this.tokensAs(this.ALICE).burn(amountFromSCI(3));
        }, "ERC20: burn amount exceeds balance");

        expect(await this.tokens.totalSupply()).to.be.equal(
          BigNumber.from(0).add(amountFromSCI(1))
        );
        expect(await this.balanceSCI(this.ALICE)).to.be.equal(amountFromSCI(1));
      });
    });

    describe("balanceOf(_owner)", function () {
      it("should have correct initial balances", async function () {
        expect(await this.balanceSCI(this.ALICE)).to.be.equal(0);
        expect(await this.balanceSCI(this.CHARLES)).to.be.equal(0);
        expect(await this.balanceSCI(this.BOB)).to.be.equal(0);
      });

      it("should return the correct balances", async function () {
        await this.creditSCI(this.ALICE, amountFromSCI(1));
        expect(await this.balanceSCI(this.ALICE)).to.be.equal(amountFromSCI(1));

        await this.creditSCI(this.ALICE, amountFromSCI(2));
        expect(await this.balanceSCI(this.ALICE)).to.be.equal(amountFromSCI(3));

        await this.creditSCI(this.BOB, amountFromSCI(3));
        expect(await this.balanceSCI(this.BOB)).to.be.equal(amountFromSCI(3));
      });
    });

    describe("allowance(_owner, _spender)", function () {
      it("...", async function () {
        describeIt(
          when("_owner != _spender"),
          this.ALICE.address,
          this.BOB.address,
          this.tokensAs(this.ALICE)
        );
        describeIt(
          when("_owner == _spender"),
          this.ALICE.address,
          this.ALICE.address,
          this.tokensAs(this.ALICE)
        );

        function describeIt(
          name: string,
          from: string,
          to: string,
          contract: Contract
        ) {
          describe("allowance(_owner, _spender) " + name, function () {
            it("should return the correct allowance", async function () {
              await contract.approve(to, amountFromSCI(1));
              expect(await contract.allowance(from, to)).to.be.equal(
                amountFromSCI(1)
              );
            });
          });
        }
      });

      it("should have correct initial allowance", async function () {
        expect(
          await this.tokens.allowance(this.ALICE.address, this.BOB.address)
        ).to.be.equal(0);
        expect(
          await this.tokens.allowance(this.ALICE.address, this.CHARLES.address)
        ).to.be.equal(0);
        expect(
          await this.tokens.allowance(this.BOB.address, this.CHARLES.address)
        ).to.be.equal(0);
      });

      it("should return the correct allowance", async function () {
        await this.tokensAs(this.ALICE).approve(
          this.BOB.address,
          amountFromSCI(1)
        );
        await this.tokensAs(this.ALICE).approve(
          this.CHARLES.address,
          amountFromSCI(2)
        );
        await this.tokensAs(this.BOB).approve(
          this.CHARLES.address,
          amountFromSCI(3)
        );
        await this.tokensAs(this.BOB).approve(
          this.ALICE.address,
          amountFromSCI(4)
        );
        await this.tokensAs(this.CHARLES).approve(
          this.ALICE.address,
          amountFromSCI(5)
        );
        await this.tokensAs(this.CHARLES).approve(
          this.BOB.address,
          amountFromSCI(6)
        );

        expect(
          await this.tokens.allowance(this.ALICE.address, this.BOB.address)
        ).to.be.equal(amountFromSCI(1));
        expect(
          await this.tokens.allowance(this.ALICE.address, this.CHARLES.address)
        ).to.be.equal(amountFromSCI(2));
        expect(
          await this.tokens.allowance(this.BOB.address, this.CHARLES.address)
        ).to.be.equal(amountFromSCI(3));
        expect(
          await this.tokens.allowance(this.BOB.address, this.ALICE.address)
        ).to.be.equal(amountFromSCI(4));
        expect(
          await this.tokens.allowance(this.CHARLES.address, this.ALICE.address)
        ).to.be.equal(amountFromSCI(5));
        expect(
          await this.tokens.allowance(this.CHARLES.address, this.BOB.address)
        ).to.be.equal(amountFromSCI(6));
      });
    });

    // NOTE: assumes that approve should always succeed
    describe("approve(_spender, _value)", function () {
      it("...", async function () {
        describeIt(
          when("_spender != sender"),
          this.ALICE.address,
          this.BOB.address,
          this.tokensAs(this.ALICE)
        );
        describeIt(
          when("_spender == sender"),
          this.ALICE.address,
          this.ALICE.address,
          this.tokensAs(this.ALICE)
        );

        function describeIt(
          name: string,
          from: string,
          to: string,
          contract: Contract
        ) {
          describe("approve(_spender, _value) " + name, function () {
            it("should return true when approving 0", async function () {
              const ok = (await (await contract.approve(to, 0)).wait()).status;
              expect(ok).to.equal(1);
            });

            it("should return true when approving", async function () {
              const ok = (
                await (await contract.approve(to, amountFromSCI(3))).wait()
              ).status;
              expect(ok).to.equal(1);
            });

            it("should return true when updating approval", async function () {
              let ok = (
                await (await contract.approve(to, amountFromSCI(2))).wait()
              ).status;
              expect(ok).to.equal(1);

              await contract.approve(to, amountFromSCI(2));

              // test decreasing approval
              ok = (await (await contract.approve(to, amountFromSCI(1))).wait())
                .status;
              expect(ok).to.equal(1);

              // test not-updating approval
              ok = (await (await contract.approve(to, amountFromSCI(1))).wait())
                .status;
              expect(ok).to.equal(1);

              // test increasing approval
              ok = (await (await contract.approve(to, amountFromSCI(3))).wait())
                .status;
              expect(ok).to.equal(1);
            });

            it("should return true when revoking approval", async function () {
              await contract.approve(to, amountFromSCI(3));
              let ok = (
                await (await contract.approve(to, amountFromSCI(0))).wait()
              ).status;
              expect(ok).to.equal(1);
            });

            it("should update allowance accordingly", async function () {
              await contract.approve(to, amountFromSCI(1));
              expect(await contract.allowance(from, to)).to.be.equal(
                amountFromSCI(1)
              );

              await contract.approve(to, amountFromSCI(3));
              expect(await contract.allowance(from, to)).to.be.equal(
                amountFromSCI(3)
              );

              await contract.approve(to, 0);
              expect(await contract.allowance(from, to)).to.be.equal("0");
            });

            it("should fire Approval events", async function () {
              let tx1 = await contract.approve(to, amountFromSCI(1));
              let result = await tx1.wait();
              if (result.events) {
                let log = result.events[0];
                expect(log.event).to.be.equal("Approval");
                expect(log.args?.owner).to.be.equal(from);
                expect(log.args?.spender).to.be.equal(to);
                expect(log.args?.value).to.be.equal(amountFromSCI(1));
              }
            });

            it("should fire Approval when allowance was set to 0", async function () {
              let result = await (await contract.approve(to, 0)).wait();
              if (result.events) {
                let log = result.events[0];
                expect(log.event).to.be.equal("Approval");
                expect(log.args?.owner).to.be.equal(from);
                expect(log.args?.spender).to.be.equal(to);
                expect(log.args?.value).to.be.equal(0);
              }
            });

            it("should fire Approval even when allowance did not change", async function () {
              await contract.approve(to, amountFromSCI(3));
              let result = await (
                await contract.approve(to, amountFromSCI(3))
              ).wait();
              if (result.events) {
                let log = result.events[0];
                expect(log.event).to.be.equal("Approval");
                expect(log.args?.owner).to.be.equal(from);
                expect(log.args?.spender).to.be.equal(to);
                expect(log.args?.value).to.be.equal(amountFromSCI(3));
              }
            });
          });
        }
      });
    });

    describe("transfer(_to, _value)", function () {
      it("should revert when trying to or from address(0)", async function () {
        let address0 = "0x0000000000000000000000000000000000000000";

        await this.toRevert(async () => {
          await this.tokensAs(this.BOB).transfer(address0, 0);
        }, "ERC20: transfer to the zero address");
      });

      it("...", async function () {
        describeIt(
          when("_to != sender"),
          this.ALICE.address,
          this.BOB.address,
          this.tokensAs(this.ALICE),
          this.creditSCIToAddress,
          this.toRevert,
          this.balanceSCIforAddress
        );
        describeIt(
          when("_to == sender"),
          this.ALICE.address,
          this.ALICE.address,
          this.tokensAs(this.ALICE),
          this.creditSCIToAddress,
          this.toRevert,
          this.balanceSCIforAddress
        );

        function describeIt(
          name: string,
          from: string,
          to: string,
          contract: Contract,
          creditSCI: any,
          toRevert: any,
          balanceSCI: any
        ) {
          describe("transfer(_to, _value) " + name, function () {
            it("should return true when called with amount of 0", async function () {
              const ok = (await (await contract.transfer(to, 0)).wait()).status;
              expect(ok).to.equal(1);
            });

            it("should return true when transfer can be made, false otherwise", async function () {
              await creditSCI(from, amountFromSCI(6));
              let ok = (
                await (await contract.transfer(to, amountFromSCI(1))).wait()
              ).status;
              expect(ok).to.equal(1);
              ok = (
                await (await contract.transfer(to, amountFromSCI(2))).wait()
              ).status;
              expect(ok).to.equal(1);
              ok = (
                await (await contract.transfer(to, amountFromSCI(3))).wait()
              ).status;
              expect(ok).to.equal(1);

              if (from != to) {
                await toRevert(async () => {
                  await contract.transfer(to, amountFromSCI(1));
                }, "ERC20: transfer amount exceeds balance");

                await toRevert(async () => {
                  await contract.transfer(to, amountFromSCI(2));
                }, "ERC20: transfer amount exceeds balance");
              } else {
                ok = (
                  await (await contract.transfer(to, amountFromSCI(3))).wait()
                ).status;
                expect(ok).to.equal(1);
              }
            });

            it("should revert when trying to transfer something while having nothing", async function () {
              // not sure why we enter with a balance here, but we do...
              let b = await balanceSCI(from);
              await contract.burn(b);

              await toRevert(async () => {
                await contract.transfer(to, amountFromSCI(1));
              }, "ERC20: transfer amount exceeds balance");
            });

            it("should revert when trying to transfer more than balance", async function () {
              await creditSCI(from, amountFromSCI(3));

              await toRevert(async () => {
                await contract.transfer(to, amountFromSCI(4));
              }, "ERC20: transfer amount exceeds balance");

              await contract.transfer(
                "0x0000000000000000000000000000000000000001",
                amountFromSCI(1),
                {
                  from: from,
                }
              );

              await toRevert(async () => {
                await contract.transfer(to, amountFromSCI(3));
              }, "ERC20: transfer amount exceeds balance");
            });

            it("should not affect totalSupply", async function () {
              await creditSCI(from, amountFromSCI(3));
              let supply1 = await contract.totalSupply();
              await contract.transfer(to, amountFromSCI(3));
              let supply2 = await contract.totalSupply();
              expect(supply2).to.be.equal(supply1);
            });

            it("should update balances accordingly", async function () {
              await creditSCI(from, amountFromSCI(3));
              let fromBalance1 = await balanceSCI(from);
              let toBalance1 = await balanceSCI(to);

              await contract.transfer(to, amountFromSCI(1));
              let fromBalance2 = await balanceSCI(from);
              let toBalance2 = await balanceSCI(to);

              if (from == to) {
                expect(fromBalance2).to.be.equal(fromBalance1);
              } else {
                expect(fromBalance2).to.be.equal(
                  fromBalance1.sub(amountFromSCI(1))
                );
                expect(toBalance2).to.be.equal(
                  toBalance1.add(amountFromSCI(1))
                );
              }

              await contract.transfer(to, amountFromSCI(2));
              let fromBalance3 = await balanceSCI(from);
              let toBalance3 = await balanceSCI(to);

              if (from == to) {
                expect(fromBalance3).to.be.equal(fromBalance2);
              } else {
                expect(fromBalance3).to.be.equal(
                  fromBalance2.sub(amountFromSCI(2))
                );
                expect(toBalance3).to.be.equal(
                  toBalance2.add(amountFromSCI(2))
                );
              }
            });

            it("should fire Transfer event", async function () {
              await creditSCI(from, amountFromSCI(3));
              let result = await (
                await contract.transfer(to, amountFromSCI(3))
              ).wait();
              if (result.events) {
                let log = result.events[0];
                expect(log.event).to.be.equal("Transfer");
                expect(log.args?.from).to.be.equal(from);
                expect(log.args?.to).to.be.equal(to);
                expect(log.args?.value).to.be.equal(amountFromSCI(3));
              }
            });

            it("should fire Transfer event when transferring amount of 0", async function () {
              let result = await (await contract.transfer(to, 0)).wait();
              if (result.events) {
                let log = result.events[0];
                expect(log.event).to.be.equal("Transfer");
                expect(log.args?.from).to.be.equal(from);
                expect(log.args?.to).to.be.equal(to);
                expect(log.args?.value).to.be.equal(0);
              }
            });
          });
        }
      });
    });

    describe("transferFrom(_from, _to, _value)", function () {
      it("should revert when trying to or from address(0)", async function () {
        let address0 = "0x0000000000000000000000000000000000000000";

        await this.toRevert(async () => {
          await this.tokensAs(this.BOB).approve(address0, amountFromSCI(3));
        }, "ERC20: approve to the zero address");

        await this.tokensAs(this.ALICE).approve(
          this.BOB.address,
          amountFromSCI(3)
        );
        await this.toRevert(async () => {
          await this.tokensAs(this.BOB).transferFrom(
            this.ALICE.address,
            address0,
            amountFromSCI(1)
          );
        }, "ERC20: transfer to the zero address");
      });

      it("should revert when trying to transfer while not allowed at all", async function () {
        await this.creditSCI(this.ALICE, amountFromSCI(3));

        await this.toRevert(async () => {
          await this.tokensAs(this.BOB).transferFrom(
            this.ALICE.address,
            this.BOB.address,
            amountFromSCI(1)
          );
        }, "ERC20: insufficient allowance");

        await this.toRevert(async () => {
          await this.tokensAs(this.BOB).transferFrom(
            this.ALICE.address,
            this.CHARLES.address,
            amountFromSCI(1)
          );
        }, "ERC20: insufficient allowance");
      });

      it("should transfer with unlimited approval (uintmax)", async function () {
        await this.creditSCI(this.ALICE, amountFromSCI(6));
        await this.tokensAs(this.ALICE).approve(
          this.BOB.address,
          BigNumber.from(2).pow(256).sub(1)
        );

        let ok = (
          await (
            await this.tokensAs(this.BOB).transferFrom(
              this.ALICE.address,
              this.CHARLES.address,
              amountFromSCI(6)
            )
          ).wait()
        ).status;
        expect(ok).to.equal(1);
      });

      it("should fire Transfer event when transferring amount of 0 and sender is not approved", async function () {
        let result = await (
          await this.tokensAs(this.BOB).transferFrom(
            this.ALICE.address,
            this.BOB.address,
            0
          )
        ).wait();
        let log = result.events[1]; //skip past Approval
        expect(log.event).to.be.equal("Transfer");
        expect(log.args?.from).to.be.equal(this.ALICE.address);
        expect(log.args?.to).to.be.equal(this.BOB.address);
        expect(log.args?.value).to.be.equal(0);
      });

      it("...", async function () {
        describeIt(
          when("_from != _to and _to != sender"),
          this.ALICE.address,
          this.BOB.address,
          this.CHARLES.address,
          this.tokensAs(this.ALICE),
          this.tokensAs(this.BOB),
          this.creditSCIToAddress,
          this.toRevert,
          this.balanceSCIforAddress
        );
        describeIt(
          when("_from != _to and _to == sender"),
          this.ALICE.address,
          this.BOB.address,
          this.BOB.address,
          this.tokensAs(this.ALICE),
          this.tokensAs(this.BOB),
          this.creditSCIToAddress,
          this.toRevert,
          this.balanceSCIforAddress
        );
        describeIt(
          when("_from == _to and _to != sender"),
          this.ALICE.address,
          this.ALICE.address,
          this.BOB.address,
          this.tokensAs(this.ALICE),
          this.tokensAs(this.ALICE),
          this.creditSCIToAddress,
          this.toRevert,
          this.balanceSCIforAddress
        );
        describeIt(
          when("_from == _to and _to == sender"),
          this.ALICE.address,
          this.ALICE.address,
          this.ALICE.address,
          this.tokensAs(this.ALICE),
          this.tokensAs(this.ALICE),
          this.creditSCIToAddress,
          this.toRevert,
          this.balanceSCIforAddress
        );

        function describeIt(
          name: string,
          from: string,
          via: string,
          to: string,
          contractFrom: Contract,
          contractVia: Contract,
          creditSCI: any,
          toRevert: any,
          balanceSCI: any
        ) {
          describe("transferFrom(_from, _to, _value) " + name, function () {
            it("should return true when called with amount of 0 and sender is approved", async function () {
              await contractFrom.approve(via, amountFromSCI(3));
              const ok = (
                await (await contractVia.transferFrom(from, to, 0)).wait()
              ).status;
              expect(ok).to.equal(1);
            });

            it("should return true when called with amount of 0 and sender is not approved", async function () {
              await contractFrom.approve(via, amountFromSCI(3));
              const ok = (
                await (await contractVia.transferFrom(from, to, 0)).wait()
              ).status;
              expect(ok).to.equal(1);
            });

            it("should return true when transfer can be made, false otherwise", async function () {
              // not sure why we enter with a balance here, but we do...
              let b = await balanceSCI(from);
              await contractFrom.burn(b);

              expect(await balanceSCI(from)).to.equal(0);

              await creditSCI(from, amountFromSCI(3));
              await contractFrom.approve(via, amountFromSCI(4));

              let ok = (
                await (
                  await contractVia.transferFrom(from, to, amountFromSCI(1))
                ).wait()
              ).status;
              expect(ok).to.equal(1);
              ok = (
                await (
                  await contractVia.transferFrom(from, to, amountFromSCI(1))
                ).wait()
              ).status;
              expect(ok).to.equal(1);

              // approved for 2, remaining balance is 1
              await toRevert(async () => {
                await contractVia.transferFrom(from, to, amountFromSCI(5));
              }, "ERC20: insufficient allowance");

              ok = (
                await (
                  await contractVia.transferFrom(from, to, amountFromSCI(1))
                ).wait()
              ).status;
              expect(ok).to.equal(1);

              if (from != to) {
                expect(await balanceSCI(from)).to.equal(0);
                // approved for 1, balance is zero
                await toRevert(async () => {
                  await contractVia.transferFrom(from, to, amountFromSCI(1));
                }, "ERC20: transfer amount exceeds balance");
              } else {
                // we sent SCI to ourself!
                expect(await balanceSCI(from)).to.equal(amountFromSCI(3));
              }
            });

            it("should revert when trying to transfer something while _from having nothing", async function () {
              let b = await balanceSCI(from);
              await contractFrom.burn(b);
              expect(await balanceSCI(from)).to.equal(0);

              await contractFrom.approve(via, amountFromSCI(3));
              await toRevert(async () => {
                await contractVia.transferFrom(from, to, amountFromSCI(1));
              }, "ERC20: transfer amount exceeds balance");
            });

            it("should revert when trying to transfer more than balance of _from", async function () {
              await contractFrom.approve(via, amountFromSCI(3));
              await creditSCI(from, amountFromSCI(2));
              await toRevert(async () => {
                await contractVia.transferFrom(from, to, amountFromSCI(3));
              }, "ERC20: transfer amount exceeds balance");
            });

            it("should revert when trying to transfer more than allowed", async function () {
              await contractFrom.approve(via, amountFromSCI(3));
              await creditSCI(from, amountFromSCI(4));
              await toRevert(async () => {
                await contractVia.transferFrom(from, to, amountFromSCI(4));
              }, "ERC20: insufficient allowance");
            });

            it("should not affect totalSupply", async function () {
              await contractFrom.approve(via, amountFromSCI(3));
              await creditSCI(from, amountFromSCI(3));
              let supply1 = await contractFrom.totalSupply();
              await contractVia.transferFrom(from, to, amountFromSCI(3));
              let supply2 = await contractFrom.totalSupply();
              expect(supply2).to.be.equal(supply1);
            });

            it("should update balances accordingly", async function () {
              await contractFrom.approve(via, amountFromSCI(3));
              await creditSCI(from, amountFromSCI(3));
              let fromBalance1 = await balanceSCI(from);
              let viaBalance1 = await balanceSCI(via);
              let toBalance1 = await balanceSCI(to);

              await contractVia.transferFrom(from, to, amountFromSCI(1));
              let fromBalance2 = await balanceSCI(from);
              let viaBalance2 = await balanceSCI(via);
              let toBalance2 = await balanceSCI(to);

              if (from == to) {
                expect(fromBalance2).to.be.equal(fromBalance1);
              } else {
                expect(fromBalance2).to.be.equal(
                  fromBalance1.sub(amountFromSCI(1))
                );
                expect(toBalance2).to.be.equal(
                  toBalance1.add(amountFromSCI(1))
                );
              }

              if (via != from && via != to) {
                expect(viaBalance2).to.be.equal(viaBalance1);
              }

              await contractVia.transferFrom(from, to, amountFromSCI(2));
              let fromBalance3 = await balanceSCI(from);
              let viaBalance3 = await balanceSCI(via);
              let toBalance3 = await balanceSCI(to);

              if (from == to) {
                expect(fromBalance3).to.be.equal(fromBalance2);
              } else {
                expect(fromBalance3).to.be.equal(
                  fromBalance2.sub(amountFromSCI(2))
                );
                expect(toBalance3).to.be.equal(
                  toBalance2.add(amountFromSCI(2))
                );
              }

              if (via != from && via != to) {
                expect(viaBalance3).to.be.equal(viaBalance2);
              }
            });

            it("should update allowances accordingly", async function () {
              await contractFrom.approve(via, amountFromSCI(3));
              await creditSCI(from, amountFromSCI(3));
              let viaAllowance1 = await contractFrom.allowance(from, via);
              let toAllowance1 = await contractFrom.allowance(from, to);

              await contractVia.transferFrom(from, to, amountFromSCI(2));
              let viaAllowance2 = await contractFrom.allowance(from, via);
              let toAllowance2 = await contractFrom.allowance(from, to);

              expect(viaAllowance2).to.be.equal(
                viaAllowance1.sub(amountFromSCI(2))
              );

              if (to != via) {
                expect(toAllowance2).to.be.equal(toAllowance1);
              }

              await contractVia.transferFrom(from, to, amountFromSCI(1));
              let viaAllowance3 = await contractFrom.allowance(from, via);
              let toAllowance3 = await contractFrom.allowance(from, to);

              expect(viaAllowance3).to.be.equal(
                viaAllowance2.sub(amountFromSCI(1))
              );

              if (to != via) {
                expect(toAllowance3).to.be.equal(toAllowance1);
              }
            });

            it("should fire Transfer event", async function () {
              await contractFrom.approve(via, amountFromSCI(3));
              await creditSCI(from, amountFromSCI(3));
              let result = await (
                await contractVia.transferFrom(from, to, amountFromSCI(3))
              ).wait();
              if (result.events) {
                let log = result.events[1]; // Skip Approvalshould revert when trying to or from address(0)
                expect(log.event).to.be.equal("Transfer");
                expect(log.args?.from).to.be.equal(from);
                expect(log.args?.to).to.be.equal(to);
                expect(log.args?.value).to.be.equal(amountFromSCI(3));
              }
            });

            it("should fire Transfer event when transferring amount of 0", async function () {
              await contractFrom.approve(via, amountFromSCI(3));
              let result = await (
                await contractVia.transferFrom(from, to, 0)
              ).wait();
              if (result.events) {
                let log = result.events[1]; // Skip Approval
                expect(log.event).to.be.equal("Transfer");
                expect(log.args?.from).to.be.equal(from);
                expect(log.args?.to).to.be.equal(to);
                expect(log.args?.value).to.be.equal(0);
              }
            });
          });
        }
      });
    });
  });

  describe("ERC-20 optional", function () {
    describe("name()", function () {
      if (options.name != null) {
        it("should return '" + options.name + "'", async function () {
          expect(await this.tokens.name()).to.be.equal(options.name);
        });
      }
    });

    describe("symbol()", function () {
      if (options.symbol != null) {
        it("should return '" + options.symbol + "'", async function () {
          expect(await this.tokens.symbol()).to.be.equal(options.symbol);
        });
      }
    });

    describe("decimals()", function () {
      if (options.decimals != null) {
        it("should return '" + options.decimals + "'", async function () {
          expect(await this.tokens.decimals()).to.be.equal(options.decimals);
        });
      }
    });
  });
});

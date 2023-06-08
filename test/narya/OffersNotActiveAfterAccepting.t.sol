// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Base.t.sol";
import {Offers} from "../../contracts/Offers.sol";
import {Tokens} from "../../contracts/Tokens.sol";
import {console} from "@narya-ai/contracts/PTest.sol";

import {OffersInterface} from "../../contracts/OffersInterface.sol";
import {TokensInterface} from "../../contracts/TokensInterface.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

contract OffersFeesTest is TestBase {
    Offers public offers;

    uint256 public listingFee = 1000000;
    uint8 public royaltyNumerator = 51;
    address NFTHolder = makeAddr("NFTHolder");
    address NFTbuyer = makeAddr("NFTbuyer");
    address attacker = makeAddr("attacker");
    uint256 offersCnt;

    function setUp() public override {
        super.setUp();

        deal(NFTHolder, 10 ether);
        deal(NFTbuyer, 10 ether);
        deal(attacker, 10 ether);

        vm.startPrank(ceo);
        offers = new Offers(payable(tokens), listingFee, royaltyNumerator);
        tokens.grantRole(tokens.MARKETPLACE_ROLE(), address(offers));
        vm.stopPrank();

        mint(NFTbuyer);
        mint(NFTHolder);
        mint(attacker);

        for (uint256 i = 0; i < 10; i++) {
            mintNFT(NFTHolder);
        }

        setApprovalForOffers(NFTbuyer);
        setApprovalForOffers(NFTHolder);
        setApprovalForOffers(attacker);
        createOffer(NFTbuyer, 1, 3);
    }

    function setApprovalForOffers(address caller) internal {
        vm.startPrank(caller);
        tokens.setApprovalForAll(address(offers), true);
        vm.stopPrank();
    }

    function createOffer(address buyer, uint64 tokenId, uint256 price) public {
        require(tokens.isMinted(tokenId), "NFT is not minted");
        require(tokens.balanceOf(buyer) >= price, "try to bid more than have");
        bytes32 key = offers.encodeKey(buyer, uint64(tokenId));
        (, address buyerAddr, , ) = offers.buyerOffers(key);
        bool offered = buyerAddr == buyer;

        offersCnt = offered ? offersCnt : offersCnt + 1;
        uint256 fee = offered ? 0 : listingFee;
        vm.startPrank(buyer);
        tokens.setApprovalForAll(address(offers), true);
        offers.setOffer{value: fee}(
            1,
            buyer,
            uint64(block.timestamp + 3 days),
            price
        );

        vm.stopPrank();
    }

    function acceptOffer(uint64 tokenId) public {
        require(tokens.isMinted(tokenId), "NFT is not minted");

        bytes32 key = offers.encodeKey(NFTbuyer, uint64(tokenId));
        (, , , uint256 price) = offers.buyerOffers(key);

        vm.startPrank(NFTHolder);
        offers.acceptOffer(NFTHolder, tokenId, NFTbuyer, price);
        vm.stopPrank();
    }

    function invariantOfferNotActiveAfterAccepting() public {
        acceptOffer(1);

        require(tokens.balanceOf(NFTbuyer, 1) == 1, "fees are incorrect");
    }
}

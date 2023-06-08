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

        vm.prank(ceo);
        offers = new Offers(payable(tokens), listingFee, royaltyNumerator);
        vm.stopPrank();

        mint(NFTbuyer);
        mint(NFTHolder);
        mint(attacker);

        mintNFT(NFTHolder);
        mintNFT(NFTHolder);
        mintNFT(NFTHolder);
    }

    function createOffer(address buyer, uint256 tokenId, uint256 price) public {
        require(tokens.balanceOf(buyer) >= 1, "try to list wrong NFT");
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

    function invariantOffersFeeAreCorrect() public {
        require(
            address(offers).balance == offersCnt * listingFee,
            "fees are incorrect"
        );
    }
}

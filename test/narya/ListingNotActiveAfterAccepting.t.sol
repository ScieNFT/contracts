// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Base.t.sol";
import {Listings} from "../../contracts/Listings.sol";

contract ListingsTest is TestBase {
    Listings public listings;

    uint256 public listingFee = 1000000;
    uint8 public royaltyNumerator = 51;
    address NFTHolder = makeAddr("NFTHolder");
    address NFTbuyer = makeAddr("NFTbuyer");
    address attacker = makeAddr("attacker");
    uint256 listingsCnt;

    function setUp() public override {
        super.setUp();

        deal(NFTHolder, 10 ether);
        deal(NFTbuyer, 10 ether);
        deal(attacker, 10 ether);

        vm.startPrank(ceo);
        listings = new Listings(payable(tokens), listingFee, royaltyNumerator);
        tokens.grantRole(tokens.MARKETPLACE_ROLE(), address(listings));
        vm.stopPrank();

        mint(NFTbuyer);
        mint(NFTHolder);
        mint(attacker);

        // Mint NFTs to Holder
        for (uint i = 0; i < 10; i++) {
            mintNFT(NFTHolder);
        }

        setApprovalForListings(NFTbuyer);
        setApprovalForListings(NFTHolder);
        setApprovalForListings(attacker);

        setListing(1, 5);
    }

    function setApprovalForListings(address caller) internal {
        vm.startPrank(caller);
        tokens.setApprovalForAll(address(listings), true);
        vm.stopPrank();
    }

    function setListing(uint64 tokenId, uint256 startPrice) public {
        vm.assume(startPrice <= tokens.balanceOf(NFTbuyer));
        require(
            tokens.balanceOf(NFTHolder, tokenId) == 1,
            "try to list wrong NFT"
        );
        (, , address seller, , , , ) = listings.sellerListings(tokenId);
        bool listed = seller == NFTHolder;
        vm.startPrank(NFTHolder);
        listingsCnt = listed ? listingsCnt : listingsCnt + 1;
        uint256 valueFee = listed ? 0 : listingFee;
        listings.setListing{value: valueFee}(
            tokenId,
            NFTHolder,
            uint64(block.timestamp),
            uint64(block.timestamp + 3 days),
            startPrice,
            false,
            0
        );
        vm.stopPrank();
    }

    function acceptListing(uint64 tokenId) public {
        skip(10);
        require(tokens.isMinted(tokenId), "NFT is not minted");

        (, , address seller, , , , ) = listings.sellerListings(tokenId);

        vm.startPrank(NFTbuyer);
        listings.acceptListing(NFTbuyer, tokenId, type(uint256).max);
        vm.stopPrank();
    }

    function invariantListingNotActiveAfterAccepting() public {
        acceptListing(1);

        require(tokens.balanceOf(NFTbuyer, 1) == 1, "fees are incorrect");
    }
}

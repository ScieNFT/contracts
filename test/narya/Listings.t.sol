// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Base.t.sol";
import {Listings} from "../../contracts/Listings.sol";

contract ListingsTest is TestBase {
    Listings public listings;

    uint256 public listingFee = 1000000;
    uint8 public royaltyNumerator = 51;

    function setUp() public override {
        super.setUp();

        vm.prank(ceo);
        listings = new Listings(payable(tokens), listingFee, royaltyNumerator);
    }

    function createListing() public {}

    function cancelListing() public {}

    function acceptListing() public {}

    function testGetListingPrice(
        uint64 _time,
        uint64 _startTime,
        bool _priceIncreases,
        uint256 _startPrice,
        uint256 _priceSlopeNumerator
    ) public {
        vm.assume(_time >= _startTime);
        // the line below is fixing the problem
        // vm.assume(_priceSlopeNumerator < (type(uint256).max >> 64));
        uint256 listingPrice = listings.getListingPrice(
            _time,
            _startTime,
            _startPrice,
            _priceIncreases,
            uint256(_priceSlopeNumerator)
        );
        console.log(listingPrice);
    }
}

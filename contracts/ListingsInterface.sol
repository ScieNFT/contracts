// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface ListingsInterface {
    /**
     * @dev A Listing tracks an auction for a staked NFT, with a price that varies linearly in time.
     * @param tokenId ERC1155 token index
     * @param seller Address of the seller
     * @param startTimeSec The time when the auction starts
     * @param endTimeSec The time when the auction ends. Set to zero for a fixed price auction that does not expire.
     * @param priceIncreases Whether the price increases over time or not
     * @param startPrice The starting price of the auction
     * @param priceSlopeNumerator Numerator for calculating the price slope
     * this requires 1000 bytes total; we are ordering to fit into 4 slots
     */
    struct Listing {
        uint64 tokenId;
        uint64 startTimeSec;
        address seller;
        uint64 endTimeSec;
        bool priceIncreases;
        uint256 startPriceAttoSci;
        uint256 priceSlopeNumerator;
    }

    // Listing Events
    event ListingUpdated(
        uint64 indexed tokenId,
        address indexed seller,
        uint64 startTimeSec,
        uint64 endTimeSec,
        uint256 indexed startPriceAttoSci,
        bool priceIncreases,
        uint256 priceSlopeNumerator
    );
    event RoyaltyNumeratorSet(uint8 royaltyNumerator);
    event ListingFeeSet(uint256 listingFee);

    // Listing Management Functions
    function setListing(
        uint64 tokenId,
        address seller,
        uint64 startTimeSec,
        uint64 endTimeSec,
        uint256 startPriceAttoSci,
        bool priceIncreases,
        uint256 priceSlopeNumerator
    ) external payable;

    function cancelListing(uint64 tokenId) external;

    function acceptListing(
        address buyer,
        uint64 tokenId,
        uint256 maxPrice
    ) external;

    // Listing Pricing Functions
    function getListingPrice(
        uint64 time,
        uint64 startTimeSec,
        uint256 startPriceAttoSci,
        bool priceIncreases,
        uint256 priceSlopeNumerator
    ) external pure returns (uint256);

    function getListingPrice(uint64 tokenId) external view returns (uint256);

    // Contract Configuration Functions
    function setRoyaltyNumerator(uint8 newRoyaltyNumerator) external;

    function setListingFee(uint256 newListingFee) external;

    function denySuperadminControl(bool deny) external;

    // Contract Control Functions
    function pause() external;

    function unpause() external;

    // Listings Mass Management
    function cancelAllListings(uint256 maxTransfers) external;

    // Contract Funds Management
    function withdraw(address payable to, uint256 value) external;
}

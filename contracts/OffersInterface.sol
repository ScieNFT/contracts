// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface OffersInterface {
    /**
     * @dev An Offer tracks a fixed price buyer offer of staked SCI tokens for a particular NFT
     * @param tokenId ERC1155 token index
     * @param buyer Address of the buyer
     * @param endTimeSec The time when the offer ends. Set to zero for an offer that does not expire.
     * @param price The offered price for the NFT
     */
    struct Offer {
        uint64 tokenId;
        address buyer;
        uint64 endTimeSec;
        uint256 price;
    }

    // Offer Events
    event OfferUpdated(
        uint64 indexed tokenId,
        address indexed buyer,
        uint256 endTimeSec,
        uint256 indexed price
    );
    event RoyaltyNumeratorSet(uint8 royaltyNumerator);
    event OfferFeeSet(uint256 offerFee);

    // Offer Management Functions
    function setOffer(
        uint64 tokenId,
        address buyer,
        uint64 endTimeSec,
        uint256 price
    ) external payable;

    function acceptOffer(
        address seller,
        uint64 tokenId,
        address buyer,
        uint256 price
    ) external;

    function cancelOffer(address buyer, uint64 tokenId) external;

    // Offer Key Encoding
    function encodeKey(
        address buyer,
        uint64 tokenId
    ) external pure returns (bytes32);

    // Contract Configuration Functions
    function setRoyaltyNumerator(uint8 newRoyaltyNumerator) external;

    function setOfferFee(uint256 newOfferFee) external;

    function denySuperadminControl(bool deny) external;

    // Contract Control Functions
    function pause() external;

    function unpause() external;

    // Offers Mass Management
    function cancelAllOffers(uint256 maxTransfers) external;

    // Contract Funds Management
    function withdraw(address payable to, uint256 value) external;
}

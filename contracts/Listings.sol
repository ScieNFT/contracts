// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

import "./Tokens.sol";
import "./ListingsInterface.sol";

/**
 * @title A marketplace where NFTs are staked in exchange for SCI tokens
 * @author ScieNFT Ltd.
 */
contract Listings is Pausable, ListingsInterface, ERC1155Holder, AccessControl {
    // Mapping from accounts to denial of SUPERADMIN acting as a custodian
    mapping(address => bool) private _superadminDenials;

    /// @dev Assign roles or changes contract addresses
    bytes32 public constant CEO_ROLE = DEFAULT_ADMIN_ROLE;

    /// @dev Withdraws minting and auction fees, sets minting and auction fees, withdraws collected fees
    bytes32 public constant CFO_ROLE = keccak256("LISTINGS_CFO_ROLE");

    /// @dev Does not pay fees
    bytes32 public constant SUPERADMIN_ROLE = keccak256("LISTINGS_SUPERADMIN");

    /// @dev A fee charged in gas tokens to create a new listing
    uint256 public listingFee;

    /// @dev A royalty is paid to the beneficiary equal to (FULL_BENEFIT_FLAG ? 100% : royaltyNumerator/256)
    uint8 public royaltyNumerator;

    Tokens public immutable tokens; // if read externally, this returns only the address string

    /// @dev tracks all listings created by the address that creates the listing, by NFT Token Id
    /// a canceled listing will have seller = address(0)
    mapping(uint64 => ListingsInterface.Listing) public sellerListings;

    // in the event of a shutdown, we will cancel all active auctions
    uint64[] private _listedTokenIds;
    uint64 public nextListedTokenId = 0;

    constructor(
        address payable tokensContractAddress,
        uint256 listingFee_,
        uint8 royaltyNumerator_
    ) Pausable() {
        _grantRole(CEO_ROLE, msg.sender);
        tokens = Tokens(tokensContractAddress);
        listingFee = listingFee_;
        royaltyNumerator = royaltyNumerator_;
    }

    /**
     * @dev ERC165 implementation
     */
    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        virtual
        override(ERC1155Receiver, AccessControl)
        returns (bool)
    {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IERC1155Receiver).interfaceId ||
            interfaceId == type(IAccessControl).interfaceId;
    }

    /**
     * @dev Emit the ListingUpdated event
     * @param tokenId ID of token
     */
    function emitListingUpdated(uint64 tokenId) internal {
        Listing memory listing = sellerListings[tokenId];
        emit ListingsInterface.ListingUpdated(
            listing.tokenId,
            listing.seller,
            listing.startTimeSec,
            listing.endTimeSec,
            listing.startPriceAttoSci,
            listing.priceIncreases,
            listing.priceSlopeNumerator
        );
    }

    /**
     * @dev Create or update an auction
     * @param tokenId ID of token
     * @param seller the owner of the NFT being listed
     * @param startTimeSec Start time for the auction, so that it can start in the future
     * @param endTimeSec End time for the auction, never ends if zero
     * @param startPriceAttoSci Start price for the auction
     * @param priceIncreases sign of slope = priceIncreases ? +1 : -1
     * @param priceSlopeNumerator slope = priceSlopeNumerator / 18446744073709551615; can be zero
     */
    function setListing(
        uint64 tokenId,
        address seller,
        uint64 startTimeSec,
        uint64 endTimeSec,
        uint256 startPriceAttoSci,
        bool priceIncreases,
        uint256 priceSlopeNumerator
    ) external payable whenNotPaused {
        require(tokens.isMinted(tokenId), "Invalid NFT");
        require(!tokens.isBlocklisted(tokenId), "NFT is blocklisted");
        require(!tokens.isBridged(tokenId), "NFT is bridged");

        Listing memory listing = sellerListings[tokenId];
        bool newListing = (listing.seller == address(0));

        if (hasRole(SUPERADMIN_ROLE, msg.sender)) {
            if (newListing) {
                require(
                    !_superadminDenials[seller],
                    "SELLER has denied SUPERADMIN"
                );
            } else {
                require(
                    !_superadminDenials[listing.seller],
                    "SELLER has denied SUPERADMIN"
                );
            }
            require(msg.value == 0, "Wrong listing fee");
        } else {
            if (newListing) {
                require(msg.sender == seller, "Only SELLER or SUPERADMIN");
                require(msg.value == listingFee, "Wrong listing fee");
            } else {
                require(
                    msg.sender == listing.seller,
                    "Only SELLER or SUPERADMIN"
                );
                require(msg.value == 0, "Wrong listing fee");
            }
        }
        require(
            endTimeSec == 0 || startTimeSec < endTimeSec,
            "Invalid start time"
        );
        require(
            endTimeSec == 0 || endTimeSec > block.timestamp,
            "Invalid end time"
        );

        sellerListings[tokenId] = Listing({
            tokenId: tokenId,
            seller: seller,
            startTimeSec: startTimeSec,
            endTimeSec: endTimeSec,
            startPriceAttoSci: startPriceAttoSci,
            priceIncreases: priceIncreases,
            priceSlopeNumerator: priceSlopeNumerator
        });

        if (newListing) {
            _listedTokenIds.push(tokenId);
            // reentrancy risk: mitigated by NFT amount <= 1
            tokens.safeTransferFrom(seller, address(this), tokenId, 1, "");
        }

        emitListingUpdated(tokenId);
    }

    /**
     * @dev Closes the auction with a particular price so we avoid recalculating. (Internal Only)
     * @param buyer the address that will pay SCI and receive the NFT
     * @param tokenId ID of NFT token
     * @param price the maximum amount to spend
     */
    function closeListing(
        address buyer,
        uint64 tokenId,
        uint256 price
    ) internal {
        address seller = sellerListings[tokenId].seller;

        // mark sale as complete to avoid reentrancy
        sellerListings[tokenId].seller = address(0);

        // the beneficiary receives the platform royalty,
        // or the full sale value if FULL_BENEFIT_FLAG is true
        uint256 royalty;
        if (!tokens.isFullBenefit(tokenId)) {
            royalty = (price * royaltyNumerator) >> 8;

            // pay out the seller

            // reentrancy risk: mitigated by marking listing inactive above
            tokens.safeTransferFrom(
                buyer,
                seller,
                uint256(tokens.SCI()),
                price - royalty,
                bytes("")
            );
        } else {
            royalty = price;
        }

        address beneficiary = tokens.beneficiaryOf(tokenId);

        // pay out beneficiary

        // reentrancy risk: mitigated by marking listing inactive above
        tokens.safeTransferFrom(
            buyer,
            beneficiary,
            uint256(tokens.SCI()),
            royalty,
            bytes("")
        );

        // transfer NFT

        // reentrancy risk: mitigated by NFT amount <= 1
        tokens.safeTransferFrom(address(this), buyer, tokenId, 1, bytes(""));

        //updates flags and emit an event with the Tokens contract
        tokens.reportMarketplaceSale(
            tokenId,
            uint64(block.timestamp), // soldAt
            buyer, // buyer
            price,
            seller, // seller
            beneficiary,
            royalty
        );
    }

    /**
     * @dev Accept the terms of the auction on behalf of the buyer. Transfers tokens and closes the listing.
     *  Reverts if the auction price exceeds the provided maxPrice.
     * @param buyer the address that will pay SCI and receive the NFT
     * @param tokenId ID of NFT token
     * @param maxPrice the maximum amount to spend
     */
    function acceptListing(
        address buyer,
        uint64 tokenId,
        uint256 maxPrice
    ) external whenNotPaused {
        if (hasRole(SUPERADMIN_ROLE, msg.sender)) {
            require(!_superadminDenials[buyer], "BUYER has denied SUPERADMIN");
        } else {
            require(msg.sender == buyer, "Only BUYER or SUPERADMIN");
        }

        Listing memory listing = sellerListings[tokenId];

        require(listing.seller != address(0), "Invalid NFT");

        require(
            listing.endTimeSec == 0 || block.timestamp < listing.endTimeSec,
            "Listing has expired"
        );

        require(
            listing.startTimeSec < block.timestamp,
            "Listing has not yet started"
        );

        uint256 price = getListingPrice(tokenId);

        require(maxPrice >= price, "Price exceeds limit");

        closeListing(buyer, tokenId, price);
    }

    /**
     * @dev Cancel a listing and return NFT to seller
     * @param tokenId ID of token
     */
    function cancelListing(uint64 tokenId) external whenNotPaused {
        address seller = sellerListings[tokenId].seller;
        require(seller != address(0), "Invalid NFT");

        if (hasRole(SUPERADMIN_ROLE, msg.sender)) {
            require(
                !_superadminDenials[seller],
                "SELLER has denied SUPERADMIN"
            );
        } else {
            require(
                msg.sender == seller || hasRole(CEO_ROLE, msg.sender),
                "Only SELLER, SUPERADMIN, or CEO"
            );
        }

        // mark listing as cancelled to avoid reentrancy
        sellerListings[tokenId].seller = address(0);

        // reentrancy risk: mitigated by NFT amount <= 1
        tokens.safeTransferFrom(address(this), seller, tokenId, 1, "");

        emitListingUpdated(tokenId);
    }

    /**
     * @dev The SUPERADMIN can act on behalf of an address as a custodian
     * @param deny set true to opt out of full custodial control
     */
    function denySuperadminControl(bool deny) external {
        _superadminDenials[msg.sender] = deny;
    }

    /**
     * @dev Get current price of order (clamped to valid uint256 range)
     * @param startTimeSec Start time for the auction
     * @param startPriceAttoSci Start price for the auction
     * @param priceIncreases sign of slope (increasing price is true, decreasing is false)
     * @param priceSlopeNumerator slope << 64; can be zero
     */
    function getListingPrice(
        uint64 time,
        uint64 startTimeSec,
        uint256 startPriceAttoSci,
        bool priceIncreases,
        uint256 priceSlopeNumerator
    ) public pure returns (uint256) {
        require(time >= startTimeSec, "Invalid time");

        uint256 change;
        if (priceSlopeNumerator >> 192 == 0) {
            // priceSlopeNumerator is less than 2**192, so multiply before shifting
            change = (uint256(time - startTimeSec) * priceSlopeNumerator) >> 64;
        } else {
            // priceSlopeNumerator is greater than or equal to 2**192, so shift before multiplying
            change = uint256(time - startTimeSec) * (priceSlopeNumerator >> 64);
        }

        if (priceIncreases) {
            // change can be at most uint256max
            // start price must be no bigger than (uint256max - change)
            uint256 maxStartPrice = type(uint256).max - change;
            if (startPriceAttoSci < maxStartPrice) {
                return startPriceAttoSci + change;
            } else {
                return type(uint256).max;
            }
        } else {
            if (startPriceAttoSci > change) {
                return (startPriceAttoSci - change);
            } else {
                return 0;
            }
        }
    }

    /**
     * @dev Get current price of an auction by tokenId
     * @param tokenId Start time for the auction
     */
    function getListingPrice(uint64 tokenId) public view returns (uint256) {
        require(tokens.isMinted(tokenId), "Invalid NFT");
        Listing memory listing = sellerListings[tokenId];
        return
            getListingPrice(
                uint64(block.timestamp),
                listing.startTimeSec,
                listing.startPriceAttoSci,
                listing.priceIncreases,
                listing.priceSlopeNumerator
            );
    }

    /**
     * @dev Set the royalty numerator as CFO
     * @param newRoyaltyNumerator royalty percentage is royaltyNumerator/256
     */
    function setRoyaltyNumerator(uint8 newRoyaltyNumerator) external {
        require(hasRole(CFO_ROLE, msg.sender), "Only CFO");
        royaltyNumerator = newRoyaltyNumerator;
        emit ListingsInterface.RoyaltyNumeratorSet(royaltyNumerator);
    }

    /**
     * @dev Set the listing fee as CFO
     * @param newListingFee fee in gas required to call setListing()
     */
    function setListingFee(uint256 newListingFee) external {
        require(hasRole(CFO_ROLE, msg.sender), "Only CFO");
        listingFee = newListingFee;
        emit ListingsInterface.ListingFeeSet(listingFee);
    }

    /**
     * @dev Cancel all active auctions, as CEO
     * @param maxTransfers max transfers to complete per call, so that we don't run out of gas
     *
     */
    function cancelAllListings(uint256 maxTransfers) external whenPaused {
        require(hasRole(CEO_ROLE, msg.sender), "Only CEO");
        uint64 listedTokenIndex = nextListedTokenId;
        for (
            uint256 successfulTransfers = 0;
            successfulTransfers < maxTransfers;
            listedTokenIndex++
        ) {
            if (_listedTokenIds.length > listedTokenIndex) {
                uint64 tokenId = _listedTokenIds[listedTokenIndex];

                address seller = sellerListings[tokenId].seller;
                if (seller != address(0)) {
                    sellerListings[tokenId].seller = address(0);

                    // reentrancy risk: mitigated by NFT amount <= 1
                    tokens.safeTransferFrom(
                        address(this),
                        seller,
                        tokenId,
                        1,
                        ""
                    );

                    emitListingUpdated(tokenId);

                    successfulTransfers++;
                }
            } else {
                break;
            }
        }
        // we only need to update our stored variable once
        nextListedTokenId = listedTokenIndex;
    }

    /**
     * @dev Withdraw collected listing fees from CFO_ROLE
     * @param to address that receives fees
     * @param value amount to send
     */
    function withdraw(address payable to, uint256 value) external {
        require(hasRole(CFO_ROLE, msg.sender), "Only CFO");
        require(address(this).balance >= value, "Value exceeds balance");
        to.transfer(value);
    }

    /**
     * @dev Pause the contract
     */
    function pause() external {
        require(hasRole(CEO_ROLE, msg.sender), "Only CEO");
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external {
        require(hasRole(CEO_ROLE, msg.sender), "Only CEO");
        _unpause();
    }

    /**
     * @dev reject gas tokens
     */
    receive() external payable {
        revert("receive() reverts");
    }

    /**
     * @dev refuse unknown calls
     */
    fallback() external {
        revert("fallback() reverts");
    }
}

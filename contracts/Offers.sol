// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

import "./Tokens.sol";
import "./OffersInterface.sol";

/**
 * @title A marketplace where SCI tokens are staked to exchange for NFTs
 * @author ScieNFT Ltd.
 */
contract Offers is Pausable, OffersInterface, ERC1155Holder, AccessControl {
    // Mapping from accounts to denial of SUPERADMIN acting as a custodian
    mapping(address => bool) private _superadminDenials;

    /// @dev Assign roles or changes contract addresses
    bytes32 public constant CEO_ROLE = DEFAULT_ADMIN_ROLE;

    /// @dev Withdraws minting and auction fees, sets minting and auction fees, withdraws collected fees
    bytes32 public constant CFO_ROLE = keccak256("OFFERS_CFO_ROLE");

    /// @dev Does not pay fees
    bytes32 public constant SUPERADMIN_ROLE = keccak256("OFFERS_SUPERADMIN");

    /// @dev A fee charged in gas tokens to create a new offer
    uint256 public offerFee;

    /// @dev A royalty is paid to the beneficiary equal to (FULL_BENEFIT_FLAG ? 100% : royaltyNumerator/256)
    uint8 public royaltyNumerator;

    Tokens public immutable tokens; // if read externally, this returns only the address string

    /// @dev tracks all offers by the encoded key keccak256(address, tokenId)
    /// an inactive offer will have NFT index = 0
    mapping(bytes32 => OffersInterface.Offer) public buyerOffers;

    // in the event of a shutdown, we will cancel all active auctions
    bytes32[] private _offerKeys;
    uint64 public nextOfferKeyIndex = 0;

    constructor(
        address payable tokensContractAddress,
        uint256 offerFee_,
        uint8 royaltyNumerator_
    ) Pausable() {
        _grantRole(CEO_ROLE, msg.sender);
        tokens = Tokens(tokensContractAddress);
        offerFee = offerFee_;
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
     * @dev Construct key from an address and NFT token id
     * @param buyer the buyer address
     * @param tokenId the NFT
     */
    function encodeKey(
        address buyer,
        uint64 tokenId
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(buyer, tokenId));
    }

    /**
     * @dev Emit the OfferUpdated event
     * @param key encoded key for the offer to report as updated
     */
    function emitOfferUpdated(bytes32 key) internal {
        emit OffersInterface.OfferUpdated(
            buyerOffers[key].tokenId,
            buyerOffers[key].buyer,
            buyerOffers[key].endTimeSec,
            buyerOffers[key].price
        );
    }

    /**
     * @dev Create or update a bid
     * @param tokenId the NFT buyer desires to purchase
     * @param buyer the SUPERADMIN can make offers on behalf of a buyers who have not opted out
     * @param endTimeSec the time at which this bid expires
     * @param price the price in SCI tokens the buyer is willing to pay (and stake)
     */
    function setOffer(
        uint64 tokenId,
        address buyer,
        uint64 endTimeSec,
        uint256 price
    ) external payable whenNotPaused {
        if (hasRole(SUPERADMIN_ROLE, msg.sender)) {
            require(!_superadminDenials[buyer], "BUYER has denied SUPERADMIN");
        } else {
            require(msg.sender == buyer, "Only BUYER or SUPERADMIN");
        }

        require(price > 0, "Invalid price");
        require(
            endTimeSec == 0 || endTimeSec > block.timestamp,
            "Invalid end time"
        );

        require(tokens.isMinted(tokenId), "Invalid NFT");
        require(!tokens.isBlocklisted(tokenId), "NFT is blocklisted");
        require(!tokens.isBridged(tokenId), "NFT is bridged");

        bytes32 key = encodeKey(buyer, tokenId);
        bool newOffer = buyerOffers[key].buyer == address(0);

        if (newOffer) {
            // charge a fee for creating a new offer
            if (hasRole(SUPERADMIN_ROLE, msg.sender)) {
                require(msg.value == 0, "Wrong offer fee");
            } else {
                require(msg.value == offerFee, "Wrong offer fee");
            }
            _offerKeys.push(key);
        } else {
            // charge no fee for updating an offer
            require(msg.value == 0, "Wrong offer fee");
        }

        uint256 stakedFT = buyerOffers[key].price;
        buyerOffers[key].tokenId = tokenId;
        buyerOffers[key].buyer = buyer;
        buyerOffers[key].price = price;
        buyerOffers[key].endTimeSec = endTimeSec;

        if (newOffer) {
            // stake SCI tokens for the bid
            // reentrancy risk: mitigated by transfer to trusted address
            tokens.safeTransferFrom(
                buyer,
                address(this),
                tokens.SCI(),
                price,
                bytes("")
            );
        } else {
            if (price > stakedFT) {
                // increase the bid
                // reentrancy risk: mitigated by transfer to trusted address
                tokens.safeTransferFrom(
                    buyer,
                    address(this),
                    uint256(tokens.SCI()),
                    price - stakedFT,
                    bytes("")
                );
            } else if (price < stakedFT) {
                // decrease the bid

                // reentrancy risk: mitigated by setting new price on offer above
                //
                // Ex.: On the first call, the offer price is 100 and the buyer sets a new price at 90.
                // Call 1 sets (stakedFT = 100) and the (offer[key].price = 90) and transfers 10. the
                // reentrant attack must now set the price < 90 to draw more SCI tokens. In this way, the
                // reentracy can only reduce the bid to zero and no double spend is possible.
                tokens.safeTransferFrom(
                    address(this),
                    buyer,
                    uint256(tokens.SCI()),
                    stakedFT - price,
                    bytes("")
                );
            }
        }

        emitOfferUpdated(key);
    }

    /**
     * @dev Purchase order and transfer tokens to seller and purchaser
     * @param tokenId ID of NFT token
     * @param buyer address of the buyer whose offer is being accepted
     * @param price as an added protection, we require the seller to supply the offer price
     */
    function acceptOffer(
        address seller,
        uint64 tokenId,
        address buyer,
        uint256 price
    ) external whenNotPaused {
        if (hasRole(SUPERADMIN_ROLE, msg.sender)) {
            require(
                !_superadminDenials[seller],
                "SELLER has denied SUPERADMIN"
            );
        } else {
            require(msg.sender == seller, "Only SELLER or SUPERADMIN");
        }

        bytes32 key = encodeKey(buyer, tokenId);
        Offer memory offer = buyerOffers[key];
        require(offer.buyer != address(0), "Invalid offer");
        require(offer.price == price, "Wrong price");

        if (offer.endTimeSec != 0) {
            require(block.timestamp < offer.endTimeSec, "Offer has expired");
        }

        // mark offer as inactive
        buyerOffers[key].buyer = address(0);

        // reentrancy risk: mitigated by NFT amount <= 1
        tokens.safeTransferFrom(seller, buyer, uint256(tokenId), 1, "");

        // the beneficiary receives the platform royalty,
        // or the full sale value if FULL_BENEFIT_FLAG is true
        uint256 royalty;
        if (!tokens.isFullBenefit(tokenId)) {
            royalty = (offer.price * royaltyNumerator) >> 8;
            // pay out owner

            // reentrancy risk: mitigated by marking offer inactive above
            tokens.safeTransferFrom(
                address(this),
                seller,
                uint256(tokens.SCI()),
                offer.price - royalty,
                bytes("")
            );
        } else {
            royalty = offer.price;
        }

        // pay out beneficiary

        // reentrancy risk: mitigated by marking offer inactive above
        tokens.safeTransferFrom(
            address(this),
            tokens.beneficiaryOf(tokenId),
            uint256(tokens.SCI()),
            royalty,
            bytes("")
        );

        // updates flags and emit an event with the Tokens contract
        tokens.reportMarketplaceSale(
            tokenId,
            uint64(block.timestamp),
            buyer,
            price,
            seller,
            tokens.beneficiaryOf(tokenId),
            royalty
        );

        emitOfferUpdated(key);
    }

    /**
     * @dev Close a bid and recover staked SCI value
     * @param tokenId ID of NFT token
     */
    function cancelOffer(address buyer, uint64 tokenId) external whenNotPaused {
        if (hasRole(SUPERADMIN_ROLE, msg.sender)) {
            require(!_superadminDenials[buyer], "BUYER has denied SUPERADMIN");
        } else {
            require(
                msg.sender == buyer || hasRole(CEO_ROLE, msg.sender),
                "Only BUYER, SUPERADMIN, or CEO"
            );
        }

        bytes32 key = encodeKey(buyer, tokenId);
        Offer memory offer = buyerOffers[key];
        require(offer.buyer != address(0), "Invalid offer");

        // mark bid as inactive active
        buyerOffers[key].buyer = address(0);

        // reentrancy risk: mitigated by marking offer inactive above
        tokens.safeTransferFrom(
            address(this),
            offer.buyer,
            tokens.SCI(),
            offer.price,
            bytes("")
        );

        emitOfferUpdated(key);
    }

    /**
     * @dev The SUPERADMIN can act on behalf of an address as a custodian
     * @param deny set true to opt out of full custodial control
     */
    function denySuperadminControl(bool deny) external {
        _superadminDenials[msg.sender] = deny;
    }

    /**
     * @dev Set the royalty numerator as CFO
     * @param newRoyaltyNumerator royalty percentage is royaltyNumerator/256
     */
    function setRoyaltyNumerator(uint8 newRoyaltyNumerator) external {
        require(hasRole(CFO_ROLE, msg.sender), "Only CFO");
        royaltyNumerator = newRoyaltyNumerator;
        emit OffersInterface.RoyaltyNumeratorSet(royaltyNumerator);
    }

    /**
     * @dev Set the offer fee as CFO
     * @param newOfferFee fee in gas required to call setOffer()
     */
    function setOfferFee(uint256 newOfferFee) external {
        require(hasRole(CFO_ROLE, msg.sender), "Only CFO");
        offerFee = newOfferFee;
        emit OffersInterface.OfferFeeSet(offerFee);
    }

    /**
     * @dev Cancel all active auctions, as CEO
     * @param maxTransfers max transfers to complete per call, so that we don't run out of gas
     *
     * When called repeatedly, it will eventually panic but all offers should be canceled
     */
    function cancelAllOffers(uint256 maxTransfers) external whenPaused {
        require(hasRole(CEO_ROLE, msg.sender), "Only CEO");
        uint64 offeredBidIndex = nextOfferKeyIndex;
        for (
            uint256 successfulTransfers = 0;
            successfulTransfers < maxTransfers;
            offeredBidIndex++
        ) {
            if (_offerKeys.length > offeredBidIndex) {
                bytes32 key = _offerKeys[offeredBidIndex];
                address buyer = buyerOffers[key].buyer;
                uint256 price = buyerOffers[key].price;

                if (buyer != address(0)) {
                    buyerOffers[key].buyer = address(0);

                    // reentrancy risk: mitigated by marking offer inactive above
                    tokens.safeTransferFrom(
                        address(this),
                        buyer,
                        uint256(tokens.SCI()),
                        price,
                        ""
                    );

                    emitOfferUpdated(key);
                    successfulTransfers++;
                }
            } else {
                break;
            }
        }
        // we only need to update our stored variable once

        nextOfferKeyIndex = offeredBidIndex;
    }

    /**
     * @dev Withdraw collected fees from CFO_ROLE
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

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface TokensInterface {
    /**
     * @dev An onchain data record for scientific work
     * @param adminHash An IPFS sha256 hex hash value that links to a JSON file providing
     *                     (e.g. title, summary, authorship, files, checksums, etc.)
     *
     * If the NFT contains more than one IPFS hex hash link, then `content` is additionally a key
     * value into the mapping that stores ContentNodes. One way to think about this is that we implicitly have:
     *
     *     *nextOwnerHash = map key @ keccak256(tokenId, ownerHash, ContentType.OWNER)
     *     *nextAdminHash = map key @ keccak256(tokenId, adminHash, ContentType.ADMIN)
     *
     * available in the ScienceNFT struct (and similar implicit pointers in any ContentNode).
     *
     * Because ownerHash is always empty in a new NFT, we make a special key to access the head of
     * the ownerContent list = keccak256(tokenId, adminHash, ContentType.OWNER)
     *
     * @param createdAt Unix epoch timestamp recording the priority date for the NFT
     * @param status Efficient storage of flag bits and other information
     */
    struct ScienceNFT {
        bytes32 adminHash;
        uint64 createdAt;
        uint192 status;
    }

    /**
     * @dev A node used with a linked list of IPFS hex hashes that is storage-efficient in hashtable memory
     *      ContentNodes are stored using a mapping where the key encodes the equivalent of the "next" pointer value.
     *
     * keccak256(tokenId, scienceNFTs[tokenId].(content hash), ContentType enum) --> ContentNode
     *
     * Note that while we're using a linked list structure, it's not a traditional singly-linked list
     * where each node explicitly stores the address of the next node. The first IPFS value (head) is stored in a ScienceNFT struct.
     * If an IPFS hex hash value is the tail of the list, there is no matching key value in the hashtable (i.e., being the
     * tail of the list is signified by a missing entry in the mapping). The next value's address is calculated when needed,
     * and the value itself appears as the `contentHash` stored at the key's location in the map
     *
     * The key formula is needed to allow NFTs to store duplicate content. However we do not allow the same content hash to appear
     * twice within a single NFT content list.
     *
     * @param contentHash A CIDv1 IPFS sha256 hex hash.
     *                    We are at the tail of the list when there is no entry in the mapping for a key built from the hash
     * @param createdAt Unix epoch timestamp recording the priority date for the content (i.e. key value)
     * @param tokenId The token that owns this node (allows us to look up Admin and Owner addresses for permission checks)
     *                - If tokenId is zero, then no node exists in the mapping for the provided key value
     *                - By returning to the ScienceNFT record and traversing lists, we can find `next` and `prev` hash values
     */
    struct ContentNode {
        bytes32 contentHash;
        uint64 createdAt;
        uint64 tokenId;
    }

    /**
     * @dev We will indicate which list is of interest with an enum
     * @note Adding fields to this enum will break things
     **/
    enum ContentType {
        OWNER,
        ADMIN
    }

    // Events
    event MintingFeeSet(uint256 mintingFee);
    event MiningFeeSet(uint256 miningFee);
    event DifficultySet(uint8 difficulty);
    event MiningIntervalSet(uint32 interval);
    event NFTUpdated(
        uint64 indexed tokenId,
        uint192 status,
        address indexed owner,
        address admin,
        address indexed beneficiary
    );
    event AdminContentNodeCreated(
        uint64 indexed tokenId,
        bytes32 indexed data,
        bytes32 indexed prev
    );
    event OwnerContentNodeCreated(
        uint64 indexed tokenId,
        bytes32 indexed data,
        bytes32 indexed prev
    );
    event MarketplaceSale(
        uint64 indexed tokenId,
        uint64 soldAt,
        address indexed buyer,
        uint256 price,
        address seller,
        address indexed beneficiary,
        uint256 royalty
    );

    // NFT Database Management
    function mintNFT(bytes32 data) external payable;

    function mintNFT(
        bytes32 data,
        uint192 status,
        address owner,
        address admin,
        address beneficiary
    ) external payable;

    function superadminMintNFT(
        bytes32 data,
        uint64 createdAt,
        uint192 status,
        address owner,
        address admin,
        address beneficiary
    ) external;

    function setAdmin(uint64 tokenId, address newAdmin) external;

    function setBeneficiary(uint64 tokenId, address newBeneficiary) external;

    function reportMarketplaceSale(
        uint64 tokenId,
        uint64 soldAt,
        address buyer,
        uint256 price,
        address seller,
        address beneficiary,
        uint256 royalty
    ) external;

    // NFT Content Management
    function appendContent(
        uint64 tokenId,
        bytes32 contentHash,
        ContentType contentType
    ) external payable;

    function superadminAppendContent(
        uint64 tokenId,
        bytes32 contentHash,
        ContentType contentType,
        uint64 createdAt
    ) external;

    // NFT Database and Content Queries
    function isMinted(uint64 tokenId) external view returns (bool);

    function getContentNodeKey(
        uint64 tokenId,
        bytes32 contentHash,
        ContentType contentType
    ) external pure returns (bytes32);

    function getAdjacentContent(
        uint64 tokenId,
        bytes32 contentHash,
        ContentType contentType
    ) external view returns (bytes32 prevContentHash, bytes32 nextContentHash);

    // NFT Status Bit Queries
    function isBlocklisted(uint64 tokenId) external view returns (bool);

    function isFullBenefit(uint64 tokenId) external view returns (bool);

    function willUnsetFullBenefit(uint64 tokenId) external view returns (bool);

    function isBridged(uint64 tokenId) external view returns (bool);

    // NFT Status Bit Control

    function blocklist(uint64 tokenId, bool value) external;

    function setFullBenefitFlag(uint64 tokenId, bool value) external;

    function setStatus(uint64 tokenId, uint192 newStatus) external;

    // Transfer of NFTs to and from bridge contracts.
    function withdrawFromContract(uint64 tokenId, address bridge) external;

    function restoreToContract(
        uint64 tokenId,
        uint192 status,
        address owner,
        address admin,
        address beneficiary
    ) external;

    // Mining SCI tokens
    function setMiningInterval(uint32 newIntervalSeconds) external;

    function setDifficulty(uint8 newDifficulty) external;

    function isCorrect(bytes32 solution) external view returns (bool);

    function mineSCI(bytes32 solution, address to) external payable;

    // Destroying SCI Tokens
    function burn(uint256 amount) external;

    // Fee Management
    /**
     * @dev Fees are paid in gas tokens / gwei
     */
    function setMintingFee(uint256 newMintingFee) external;

    function setMiningFee(uint256 newMiningFee) external;

    function withdraw(address payable to, uint256 value) external;

    function withdrawSCI(address to, uint256 value) external;
}

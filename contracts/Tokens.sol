// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/IERC1155MetadataURI.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "@openzeppelin/contracts/access/AccessControl.sol";

import "./TokensInterface.sol";

/**
 * @title A hybrid ERC20/ERC1155 contract for NFTs supporting content enhancement and the SCI fungible token
 * @author ScieNFT Ltd.
 */
contract Tokens is
    IERC20,
    IERC20Metadata,
    IERC1155,
    IERC1155MetadataURI,
    AccessControl,
    TokensInterface
{
    /// @dev We implement the ERC1155 interface for NFTs, with SCI as a special case (token ID = 0).
    /// We additionally implement the ERC20 interface for the SCI token.

    // Mapping from token ID to the account balances map (ERC1155)
    mapping(uint64 => mapping(address => uint256)) private _balances;

    // Mapping from account to the operator approvals map (ERC1155)
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // Used as the URI for all token types by relying on ID substitution, e.g. https://token-cdn-domain/{id}.json
    string private _uri;

    /// @dev We are implementing the ERC20 interface for SCI tokens
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply = 0;
    string private _name = "ScieNFT Utility Token";
    string private _symbol = "SCI";

    /// @dev Deploys this contract, assign roles or changes contract addresses (always 0x0)
    bytes32 public constant CEO_ROLE = AccessControl.DEFAULT_ADMIN_ROLE;
    /// @dev Withdraws minting and auction fees, sets minting and auction fees, withdraws collected fees
    bytes32 public constant CFO_ROLE = keccak256("TOKENS_CFO");
    /// @dev Set errata or blocklist flag on any NFT, mints NFTs with no fees and arbitrary data
    bytes32 public constant SUPERADMIN_ROLE = keccak256("TOKENS_SUPERADMIN");
    /// @dev Service role for marketplaces
    bytes32 public constant MARKETPLACE_ROLE = keccak256("TOKENS_MARKETPLACE");
    /// @dev Service role for a contract where NFTs can be staked by a cross chain bridge
    bytes32 public constant BRIDGE_ROLE = keccak256("TOKENS_BRIDGE");

    /// @dev Index of the SCI fungible token
    uint8 public constant SCI = 0;
    /// @dev NFTs are indexed as [FIRST_NFT...]
    uint8 public constant FIRST_NFT = 1;

    /// @dev The UNSET_FULL_BENEFIT_FLAG if true, the next marketplace transfer will clear FULL_BENEFIT_FLAG
    uint8 public constant UNSET_FULL_BENEFIT_FLAG = 1 << 0;
    /// @dev The FULL_BENEFIT_FLAG sets the marketplace royalty to 100%
    uint8 public constant FULL_BENEFIT_FLAG = 1 << 1;
    /// @dev The BLOCKLIST_FLAG marks an NFT as retracted on scienft.com
    uint8 public constant BLOCKLIST_FLAG = 1 << 2;
    /// @dev The BRIDGED_FLAG marks an NFT as staked to a bridge contract
    uint8 public constant BRIDGED_FLAG = 1 << 3;

    /// @dev Each NFT stores two linked lists of "ContentNodes" with IPFS addresses as key values
    /// Each mapping key is calculated as keccak256(tokenId, content hash, content type)
    mapping(bytes32 => TokensInterface.ContentNode) public contentNodes;

    /// @dev This contract introduces the "ScienceNFT": a record of scientific work on the blockchain
    /// Each mapping key is a token ID for an NFT
    mapping(uint64 => TokensInterface.ScienceNFT) public scienceNFTs;

    /// @dev NFTs are mapped starting from uint64(FIRST_NFT) to make room for fungible tokens
    uint64 private _nextNftId;

    /// @dev Fee charged to mint an NFT or to append a ContentNode, in native gas tokens / gwei
    uint256 public mintingFee;

    /// @dev Proof-of-Work Mining Support
    uint256 public miningFee;
    uint32 public miningIntervalSeconds;
    uint8 public difficulty;
    uint256 public lastMiningTimestamp = 0;
    bytes32 public lastMiningSolution = keccak256("SCIENFT");
    uint8 public miningGeneration = 0;
    uint256 public miningCount = 1;
    // set by contructor
    uint256 public minimumMiningYield;
    uint256 public miningYield;
    uint256 public maxTotalSupply;

    /// @dev The Owner controls transfers and may append content to the owner's content list
    /// Each mapping key is a token ID for an NFT
    mapping(uint64 => address) public ownerOf;

    /// @dev The Admin can set the FULL_BENEFIT_FLAG or BLOCKLIST_FLAG, can change the Beneficiary and Admin,
    ///      and may append content to the admin's content list
    /// Each mapping key is a token ID for an NFT
    mapping(uint64 => address) public adminOf;

    /// @dev The Beneficiary collects royalties for marketplace contract transfers
    /// Each mapping key is a token ID for an NFT
    mapping(uint64 => address) public beneficiaryOf;

    /**
     * @dev Constructor for the Token contract
     * @param uri_ ERC1155 metadata uri. See https://eips.ethereum.org/EIPS/eip-1155#metadata
     */
    constructor(
        string memory uri_,
        uint256 initialMiningYield,
        uint256 minimumMiningYield_,
        uint256 miningFee_,
        uint8 difficulty_,
        uint32 miningIntervalSeconds_,
        uint256 maxTotalSupply_,
        uint256 mintingFee_
    ) {
        // AccessControl limits grantRole() to the DEFAULT_ADMIN_ROLE = 0x0.
        // We want our CEO to be able to change the other assigned roles, so
        // we must either make the CEO_ROLE = 0x0 or call `_setRoleAdmin()` for
        // each other permissioned contract role.

        // _grantRole doesn't require the caller to already be an admin
        AccessControl._grantRole(CEO_ROLE, address(msg.sender));

        _setURI(uri_);

        miningYield = initialMiningYield;
        minimumMiningYield = minimumMiningYield_;
        miningFee = miningFee_;
        difficulty = difficulty_;
        miningIntervalSeconds = miningIntervalSeconds_;
        maxTotalSupply = maxTotalSupply_;

        mintingFee = mintingFee_;

        _nextNftId = uint64(FIRST_NFT);
    }

    /**
     * @dev ERC165 implementation
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165, AccessControl) returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IERC20Metadata).interfaceId ||
            interfaceId == type(IERC1155MetadataURI).interfaceId ||
            interfaceId == type(IAccessControl).interfaceId ||
            interfaceId == type(IERC1155).interfaceId ||
            interfaceId == type(IERC20).interfaceId;
    }

    /**
     * @dev Emit the NFTUpdated event
     * @param tokenId ERC1155 token index
     */
    function emitNFTUpdated(uint64 tokenId) internal {
        emit TokensInterface.NFTUpdated(
            tokenId,
            scienceNFTs[tokenId].status,
            ownerOf[tokenId],
            adminOf[tokenId],
            beneficiaryOf[tokenId]
        );
    }

    /**
     * @dev Transfer token
     * @param from Sender address
     * @param to Receiver address
     * @param id ERC1155 token index
     * @param amount Amount to transfer
     * @param data data bytes (ignored)
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public {
        require(
            from == msg.sender || isApprovedForAll(from, msg.sender),
            "ERC1155: caller is not token owner or approved"
        );
        uint64 tokenId = uint64(id);
        if (tokenId >= uint64(FIRST_NFT)) {
            require(isMinted(tokenId), "Invalid NFT");
            require(!isBridged(tokenId), "NFT is bridged");
            ownerOf[tokenId] = to;
        }
        // -- WARNING --
        // This function allows arbitrary code execution, opening us to possible reentrancy attacks
        _safeTransferFrom(from, to, tokenId, amount, data);

        if (tokenId >= uint64(FIRST_NFT)) {
            emitNFTUpdated(tokenId);
        }
    }

    /**
     * @dev Batch transfer tokens
     * @param from Sender address
     * @param to Receiver address
     * @param ids List of ERC1155 token indexes
     * @param amounts List of amounts to transfer
     * @param data data bytes (ignored)
     */
    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public {
        require(
            from == msg.sender || isApprovedForAll(from, msg.sender),
            "ERC1155: caller is not token owner or approved"
        );

        for (uint256 i = 0; i < ids.length; i++) {
            uint64 tokenId = uint64(ids[i]);
            if (tokenId >= uint64(FIRST_NFT)) {
                require(isMinted(tokenId), "Invalid NFT");
                require(!isBridged(tokenId), "NFT is bridged");
                ownerOf[tokenId] = to;
            }
        }

        // -- WARNING --
        // This function allows arbitrary code execution, opening us to possible reentrancy attacks
        _safeBatchTransferFrom(from, to, ids, amounts, data);

        for (uint256 i = 0; i < ids.length; i++) {
            uint64 tokenId = uint64(ids[i]);
            if (tokenId >= uint64(FIRST_NFT)) {
                emitNFTUpdated(tokenId);
            }
        }
    }

    /**
     * @dev Return true if NFT token has been minted
     * @param tokenId ERC1155 token index
     */
    function isMinted(uint64 tokenId) public view returns (bool) {
        return tokenId >= uint64(FIRST_NFT) && tokenId < _nextNftId;
    }

    /**
     * @dev Return true if BLOCKLIST_FLAG is true ("NFT has been blocklisted from ScieNFT.")
     * @param tokenId ERC1155 token index
     */
    function isBlocklisted(uint64 tokenId) external view returns (bool) {
        return (scienceNFTs[tokenId].status & uint192(BLOCKLIST_FLAG)) != 0;
    }

    /**
     * @dev Return true if FULL_BENEFIT_FLAG is true ("NFT royalty is 100% of sale price.")
     * @param tokenId ERC1155 token index
     */
    function isFullBenefit(uint64 tokenId) external view returns (bool) {
        return (scienceNFTs[tokenId].status & uint192(FULL_BENEFIT_FLAG)) != 0;
    }

    /**
     * @dev Return true if UNSET_FULL_BENEFIT_FLAG is true
     *      ("FULL_BENEFIT_FLAG will be unset on next marketplace transfer.")
     * @param tokenId ERC1155 token index
     */
    function willUnsetFullBenefit(uint64 tokenId) external view returns (bool) {
        return
            (scienceNFTs[tokenId].status & uint192(UNSET_FULL_BENEFIT_FLAG)) !=
            0;
    }

    /**
     * @dev Return true if BRIDGED_FLAG is true ("NFT is locked in a bridge contract.")
     * @param tokenId ERC1155 token index
     */
    function isBridged(uint64 tokenId) public view returns (bool) {
        return (scienceNFTs[tokenId].status & uint192(BRIDGED_FLAG)) != 0;
    }

    /**
     * @dev Returns true when "solution" is a valid mining answer
     * @param solution the solution to the hash difficulty puzzle
     */
    function isCorrect(bytes32 solution) public view returns (bool) {
        if (difficulty == 0) {
            return true;
        }
        uint256 x = uint256(
            keccak256(abi.encodePacked(lastMiningSolution, solution))
        );
        uint8 n = difficulty;
        for (uint8 i = 255; i >= 0; i--) {
            if (x & (1 << i) == 0) {
                n -= 1;
                if (n == 0) {
                    return true;
                }
            } else {
                break;
            }
        }
        return false;
    }

    /**
     * @dev Mine ScieNFT Utility Tokens
     * @param solution the solution to the hash difficulty puzzle
     * @param to address that will receive the mined SCI tokens
     */
    function mineSCI(bytes32 solution, address to) external payable {
        require(msg.value == miningFee, "Wrong mining fee");
        require(_totalSupply < maxTotalSupply, "Maximum supply has been mined");
        require(isCorrect(solution), "Wrong solution");

        // lastMiningTimestamp is only ever 0 or block.timestamp, so this is safe
        uint256 delta = block.timestamp - lastMiningTimestamp;

        require(
            delta > miningIntervalSeconds,
            "Mining interval has not elapsed"
        );

        uint256 yield = miningYield;

        lastMiningSolution = solution;
        lastMiningTimestamp = block.timestamp;
        _totalSupply += yield;
        miningCount -= 1;
        if (miningCount == 0) {
            miningGeneration += 1;
            miningCount = uint256(1) << miningGeneration;
            miningYield = yield >> 2;
            // enforce minimum miningYield
            if (miningYield < minimumMiningYield) {
                miningYield = minimumMiningYield;
            }
        }

        _mint(to, uint256(SCI), yield, bytes(""));
    }

    /**
     * @dev Add a new NFT to the database (internal use only)
     * @param contentHash The first CIDv1 sha256 hex hash value for the NFT, to be added as the head of the admin content list.
     * @param createdAt Publication priority timestamp uint64 (set from block.timestamp in mintNFT)
     * @param status Full status bits
     * @param owner Address of token owner
     * @param admin Address of token admin
     * @param beneficiary Address of token beneficiary
     */
    function createNFT(
        bytes32 contentHash,
        uint64 createdAt,
        uint192 status,
        address owner,
        address admin,
        address beneficiary
    ) internal {
        require(contentHash != 0x0, "Invalid content");

        uint64 tokenId = _nextNftId;

        // create the new NFT record
        ScienceNFT storage newNFT = scienceNFTs[tokenId];
        newNFT.adminHash = contentHash;
        newNFT.createdAt = createdAt;
        newNFT.status = status;

        ownerOf[tokenId] = owner;
        adminOf[tokenId] = admin;
        beneficiaryOf[tokenId] = beneficiary;

        _mint(owner, tokenId, 1, bytes(""));

        _nextNftId++;

        emitNFTUpdated(tokenId);
        emit TokensInterface.AdminContentNodeCreated(
            tokenId,
            newNFT.adminHash,
            0x0
        );
    }

    /**
     * @dev Mint a new non-fungible token (from any adddress)
     * @param contentHash The first CIDv1 sha256 hex hash value for the NFT, to be added as the head of the admin content list.
     * @param status Full status bits
     * @param owner Address of token owner
     * @param admin Address of token admin
     * @param beneficiary Address of token beneficiary
     */
    function mintNFT(
        bytes32 contentHash,
        uint192 status,
        address owner,
        address admin,
        address beneficiary
    ) public payable {
        require(msg.value == mintingFee, "Wrong minting fee");
        uint64 createdAt = uint64(block.timestamp);

        createNFT(contentHash, createdAt, status, owner, admin, beneficiary);
    }

    /**
     * @dev Mint a new non-fungible token with default values (from any adddress)
     * @param contentHash The first CIDv1 sha256 hex hash value for the NFT, to be added as the head of the admin content list.
     */
    function mintNFT(bytes32 contentHash) external payable {
        require(msg.value == mintingFee, "Wrong minting fee");
        uint192 status = uint192(UNSET_FULL_BENEFIT_FLAG | FULL_BENEFIT_FLAG);
        uint64 createdAt = uint64(block.timestamp);

        createNFT(
            contentHash,
            createdAt,
            status,
            msg.sender,
            msg.sender,
            msg.sender
        );
    }

    /**
     * @dev Mint NFT with arbitrary parameters and no minting fee (from SUPERADMIN_ROLE)
     * @param contentHash The first CIDv1 sha256 hex hash value for the NFT, to be added as the head of the admin content list.
     * @param createdAt Publication priority timestamp uint64 (set from block.timestamp in mintNFT)
     * @param status Full status bits
     * @param owner Address of token owner
     * @param admin Address of token admin
     * @param beneficiary Address of token beneficiary
     */
    function superadminMintNFT(
        bytes32 contentHash,
        uint64 createdAt,
        uint192 status,
        address owner,
        address admin,
        address beneficiary
    ) external {
        require(hasRole(SUPERADMIN_ROLE, msg.sender), "Only SUPERADMIN");

        createNFT(contentHash, createdAt, status, owner, admin, beneficiary);
    }

    /**
     * @dev Return the key value where a contentHash entry is stored in the mapping
     * @param tokenId ERC1155 token index
     * @param contentHash The target IPFS hex hash value to find in the indicated list
     * @param contentType The content list of interest (ADMIN or OWNER)
     * exposing this function makes it easier to do list traversal as a client
     */
    function getContentNodeKey(
        uint64 tokenId,
        bytes32 contentHash,
        ContentType contentType
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(tokenId, contentHash, contentType));
    }

    /**
     * @dev Return the previous and next IPFS hash in a content list (or 0x0 if at the head/tail)
     * @param tokenId ERC1155 token index
     * @param contentHash The target IPFS hex hash value to find in the indicated list
     * @param contentType The content list of interest (ADMIN or OWNER)
     *
     * If `currentData` does not match any known IPFS content for the provided NFT/list we reject as invalid.
     */
    function getAdjacentContent(
        uint64 tokenId,
        bytes32 contentHash,
        TokensInterface.ContentType contentType
    ) public view returns (bytes32 prevContentHash, bytes32 nextContentHash) {
        require(isMinted(tokenId), "Invalid NFT");
        require(contentHash != 0x0, "Invalid content");

        // start at the head of the list
        prevContentHash = 0x0;

        // note enter into the list from adminHash, branching on contentType in the key
        bytes32 currentContentHash = scienceNFTs[tokenId].adminHash;
        bytes32 nextKey = getContentNodeKey(
            tokenId,
            currentContentHash,
            contentType
        );
        nextContentHash = contentNodes[nextKey].contentHash; // 0x0 if curr is the last IPFS hash value

        // force prev to 0x0 for the special case of an empty owner content list
        if (contentType == ContentType.OWNER) {
            currentContentHash = 0x0;
        }
        // traverse to the tail of the list
        bool found = contentHash == currentContentHash;

        while (!found && nextContentHash != 0x0) {
            prevContentHash = currentContentHash;
            currentContentHash = nextContentHash;

            nextKey = getContentNodeKey(
                tokenId,
                currentContentHash,
                contentType
            );
            nextContentHash = contentNodes[nextKey].contentHash; // 0x0 when at the tail

            found = contentHash == currentContentHash;
        }

        // check if we found currentData or not
        require(found, "Content not found");

        return (prevContentHash, nextContentHash);
    }

    /**
     * @dev Append a new content node to an NFT (internal use only)
     * @param tokenId ERC1155 token index
     * @param contentHash The new CIDv1 sha256 hex hash value to append to the NFT
     * @param contentType The content list of interest (ADMIN or OWNER)
     * @param createdAt Publication priority timestamp uint64 (set from block.timestamp in mintNFT)
     */
    function appendNewContent(
        uint64 tokenId,
        bytes32 contentHash,
        TokensInterface.ContentType contentType,
        uint64 createdAt
    ) internal {
        require(isMinted(tokenId), "Invalid NFT");
        require(contentHash != 0x0, "Invalid content");

        // start at the head of the list
        bytes32 prevContentHash = 0x0;

        // note enter into the list from adminHash, branching on contentType in the key
        bytes32 currentContentHash = scienceNFTs[tokenId].adminHash;
        bytes32 nextKey = getContentNodeKey(
            tokenId,
            currentContentHash,
            contentType
        );
        bytes32 nextContentHash = contentNodes[nextKey].contentHash; // 0x0 if curr is the last IPFS hash value

        // refuse to append identical content records to an NFT
        require(contentHash != currentContentHash, "Duplicate content");

        // force prev to 0x0 for the special case of an empty owner content list
        if (contentType == ContentType.OWNER) {
            currentContentHash = 0x0;
        }

        // traverse to the tail of the list
        while (nextContentHash != 0x0) {
            currentContentHash = nextContentHash;

            require(contentHash != currentContentHash, "Duplicate content");
            nextKey = getContentNodeKey(
                tokenId,
                currentContentHash,
                contentType
            );
            nextContentHash = contentNodes[nextKey].contentHash; // 0x0 when at the tail
        }

        // we will append a new value after currentContentHash, so it will be the prev
        prevContentHash = currentContentHash;

        // append the new content at the tail
        // note this is a little tricky because we are using `n-1` ContentNodes to represent the list of
        // `n` IPFS hex hash values. After traversing the list above, nextKey contains the "pointer" to
        // the memory location where the new IPFS hex hash value should be appended
        ContentNode storage newLastNode = contentNodes[nextKey]; // newLastNode is a new entry in the mapping!
        newLastNode.tokenId = tokenId;
        newLastNode.contentHash = contentHash;
        newLastNode.createdAt = createdAt;

        if (contentType == ContentType.OWNER) {
            emit TokensInterface.OwnerContentNodeCreated(
                newLastNode.tokenId,
                newLastNode.contentHash,
                prevContentHash
            );
        } else {
            // contentType = ContentType.ADMIN
            emit TokensInterface.AdminContentNodeCreated(
                newLastNode.tokenId,
                newLastNode.contentHash,
                prevContentHash
            );
        }
    }

    /**
     * @dev Append new content to an NFT (from any address)
     * @param tokenId ERC1155 token index
     * @param contentHash The target IPFS hex hash value to find in the indicated list
     * @param contentType The content list of interest (ADMIN or OWNER)
     */
    function appendContent(
        uint64 tokenId,
        bytes32 contentHash,
        TokensInterface.ContentType contentType
    ) public payable {
        require(isMinted(tokenId), "Invalid NFT");
        require(msg.value == mintingFee, "Wrong minting fee");
        require(!isBridged(tokenId), "NFT is bridged");
        if (contentType == ContentType.OWNER) {
            require(balanceOf(msg.sender, tokenId) > 0, "Only OWNER");
        } else {
            // contentType = ContentType.ADMIN
            require(msg.sender == adminOf[tokenId], "Only ADMIN");
        }
        appendNewContent(
            tokenId,
            contentHash,
            contentType,
            uint64(block.timestamp)
        );
    }

    /**
     * @dev Append new content to an NFT with no fees (as SUPERADMIN_ROLE)
     * @param tokenId ERC1155 token index
     * @param contentHash The target IPFS hex hash value to find in the indicated list
     * @param contentType The content list of interest (ADMIN or OWNER)
     * @param createdAt Publication priority timestamp uint64
     */
    function superadminAppendContent(
        uint64 tokenId,
        bytes32 contentHash,
        TokensInterface.ContentType contentType,
        uint64 createdAt
    ) public {
        require(isMinted(tokenId), "Invalid NFT");
        require(hasRole(SUPERADMIN_ROLE, msg.sender), "Only SUPERADMIN");
        require(!isBridged(tokenId), "NFT is bridged");
        appendNewContent(tokenId, contentHash, contentType, createdAt);
    }

    /**
     * @dev Set minting fee from CFO_ROLE (in gas token to avoid needing extra permissions)
     * @param newMintingFee New minting fee amount
     */
    function setMintingFee(uint256 newMintingFee) external {
        require(hasRole(CFO_ROLE, msg.sender), "Only CFO");
        mintingFee = newMintingFee;
        emit TokensInterface.MintingFeeSet(mintingFee);
    }

    /**
     * @dev Set mining fee from CFO_ROLE (in gas token to avoid needing extra permissions)
     * @param newMiningFee New minting fee amount
     */
    function setMiningFee(uint256 newMiningFee) external {
        require(hasRole(CFO_ROLE, msg.sender), "Only CFO");
        miningFee = newMiningFee;
        emit TokensInterface.MiningFeeSet(miningFee);
    }

    /**
     * @dev Set mining difficulty
     * @param newDifficulty number of leading hash zeros
     */
    function setDifficulty(uint8 newDifficulty) external {
        require(hasRole(CFO_ROLE, msg.sender), "Only CFO");
        difficulty = newDifficulty;
        emit TokensInterface.DifficultySet(difficulty);
    }

    /**
     * @dev Set mining interval in seconds
     * @param newInterval seconds that must elapse between mining calls
     */
    function setMiningInterval(uint32 newInterval) external {
        require(hasRole(CFO_ROLE, msg.sender), "Only CFO");
        miningIntervalSeconds = newInterval;
        emit TokensInterface.MiningIntervalSet(miningIntervalSeconds);
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
     * @dev Change admin of an NFT, from adminOf[tokenId]
     * @param tokenId ID of an NFT
     * @param newAdmin Address of new admin
     */
    function setAdmin(uint64 tokenId, address newAdmin) external {
        require(isMinted(tokenId), "Invalid NFT");
        require(msg.sender == adminOf[tokenId], "Only ADMIN");
        require(!isBridged(tokenId), "NFT is bridged");

        adminOf[tokenId] = newAdmin;

        emitNFTUpdated(tokenId);
    }

    /**
     * @dev Change beneficiary of an NFT, from adminOf[tokenId]
     * @param tokenId ID of an NFT
     * @param newBeneficiary Address of new beneficiary
     */
    function setBeneficiary(uint64 tokenId, address newBeneficiary) external {
        require(isMinted(tokenId), "Invalid NFT");
        require(msg.sender == adminOf[tokenId], "Only ADMIN");
        require(!isBridged(tokenId), "NFT is bridged");

        beneficiaryOf[tokenId] = newBeneficiary;

        emitNFTUpdated(tokenId);
    }

    /**
     * @dev Set the full status bits for an NFT, from SUPERADMIN_ROLE
     * @param tokenId ID of an NFT
     * @param newStatus new status bits
     */
    function setStatus(uint64 tokenId, uint192 newStatus) external {
        require(isMinted(tokenId), "Invalid NFT");
        require(hasRole(SUPERADMIN_ROLE, msg.sender), "Only SUPERADMIN");
        require(!isBridged(tokenId), "NFT is bridged");

        scienceNFTs[tokenId].status = newStatus;

        emitNFTUpdated(tokenId);
    }

    /**
     * @dev Block an NFT from ScieNFT platforms, from SUPERADMIN_ROLE
     * @param tokenId ID of an NFT
     * @param value new BLOCKLIST_FLAG value
     */
    function blocklist(uint64 tokenId, bool value) external {
        require(isMinted(tokenId), "Invalid NFT");
        require(hasRole(SUPERADMIN_ROLE, msg.sender), "Only SUPERADMIN");
        require(!isBridged(tokenId), "NFT is bridged");

        if (value) scienceNFTs[tokenId].status |= uint192(BLOCKLIST_FLAG);
        else scienceNFTs[tokenId].status &= ~(uint192(BLOCKLIST_FLAG));

        emitNFTUpdated(tokenId);
    }

    /**
     * @dev Set full benefit flag, as the NFT owner
     * @param tokenId ID of an NFT
     * @param value new FULL_BENEFIT_FLAG value
     */
    function setFullBenefitFlag(uint64 tokenId, bool value) external {
        require(isMinted(tokenId), "Invalid NFT");
        require(balanceOf(msg.sender, tokenId) > 0, "Only OWNER");
        require(!isBridged(tokenId), "NFT is bridged");

        if (value) scienceNFTs[tokenId].status |= uint192(FULL_BENEFIT_FLAG);
        else scienceNFTs[tokenId].status &= ~(uint192(FULL_BENEFIT_FLAG));

        emitNFTUpdated(tokenId);
    }

    /**
     * @dev Allows a marketplace to set flags and trigger an event
     * @param tokenId ID of an NFT
     * @param soldAt epoch timestamp to report as the time of sale
     * @param buyer buyer
     * @param price the price buyer paid
     * @param seller seller
     * @param beneficiary address paid the royalty
     * @param royalty the royalty paid
     */
    function reportMarketplaceSale(
        uint64 tokenId,
        uint64 soldAt,
        address buyer,
        uint256 price,
        address seller,
        address beneficiary,
        uint256 royalty
    ) external {
        require(hasRole(MARKETPLACE_ROLE, msg.sender), "Only MARKETPLACE");
        // remove FULL_BENEFIT_FLAG on marketplace transfers if the UNSET_FULL_BENEFIT_FLAG is true
        if (
            (scienceNFTs[tokenId].status & uint192(UNSET_FULL_BENEFIT_FLAG)) !=
            0
        ) {
            scienceNFTs[tokenId].status &= ~(
                uint192((FULL_BENEFIT_FLAG | UNSET_FULL_BENEFIT_FLAG))
            );
            emitNFTUpdated(tokenId);
        }
        emit TokensInterface.MarketplaceSale(
            tokenId,
            soldAt,
            buyer,
            price,
            seller,
            beneficiary,
            royalty
        );
    }

    /**
     * @dev Marks an NFT as moved to a different contract, from OWNER
     * @param tokenId ID of an NFT
     * @param bridge the bridge address
     * This is called by the BRIDGE after it has received the staked NFT
     */
    function withdrawFromContract(uint64 tokenId, address bridge) external {
        require(isMinted(tokenId), "Invalid NFT");
        require(!isBridged(tokenId), "NFT is bridged");
        require(balanceOf(msg.sender, tokenId) > 0, "Only OWNER");
        require(hasRole(BRIDGE_ROLE, bridge), "Invalid BRIDGE");

        safeTransferFrom(msg.sender, bridge, tokenId, 1, "");
        scienceNFTs[tokenId].status |= uint192(BRIDGED_FLAG);

        emitNFTUpdated(tokenId);
    }

    /**
     * @dev Restores an NFT that was marked as bridged with its latest data, from BRIDGE_ROLE
     * @param tokenId ID of an NFT
     * @param status Status info as uint192
     * @param owner Address of token owner
     * @param admin Address of token admin
     * @param beneficiary Address of token beneficiary
     *
     * This is called by the BRIDGE after it has sent the NFT back to its owner
     */
    function restoreToContract(
        uint64 tokenId,
        uint192 status,
        address owner,
        address admin,
        address beneficiary
    ) external {
        require(isMinted(tokenId), "Invalid NFT");
        require(isBridged(tokenId), "NFT is not bridged");
        require(hasRole(BRIDGE_ROLE, msg.sender), "Only BRIDGE");
        require(
            owner != address(0),
            "Invalid OWNER: transfer to the zero address"
        );

        ScienceNFT storage restoredNFT = scienceNFTs[tokenId];

        restoredNFT.status = status & ~(uint192(BRIDGED_FLAG));
        ownerOf[tokenId] = owner;
        adminOf[tokenId] = admin;
        beneficiaryOf[tokenId] = beneficiary;

        safeTransferFrom(msg.sender, owner, tokenId, 1, "");

        emitNFTUpdated(tokenId);
    }

    /**
     * @dev Returns the name of the token.
     */
    function name() public view virtual override returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5.05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the value {ERC20} uses, unless this function is
     * overridden;
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view virtual override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(
        address account
    ) public view virtual override returns (uint256) {
        return balanceOf(account, uint256(SCI));
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     */
    function transfer(
        address to,
        uint256 amount
    ) public virtual override returns (bool) {
        address owner = msg.sender;
        _transfer(owner, to, amount);
        return true;
    }

    /**
     * @dev See {IERC20-allowance}.
     */
    function allowance(
        address owner,
        address spender
    ) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }

    /**
     * @dev See {IERC20-approve}.
     *
     * NOTE: If `amount` is the maximum `uint256`, the allowance is not updated on
     * `transferFrom`. This is semantically equivalent to an infinite approval.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function approve(
        address spender,
        uint256 amount
    ) public virtual override returns (bool) {
        address owner = msg.sender;
        _approve(owner, spender, amount);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     *
     * Emits an {Approval} event indicating the updated allowance. This is not
     * required by the EIP. See the note at the beginning of {ERC20}.
     *
     * NOTE: Does not update the allowance if the current allowance
     * is the maximum `uint256`.
     *
     * Requirements:
     *
     * - `from` and `to` cannot be the zero address.
     * - `from` must have a balance of at least `amount`.
     * - the caller must have allowance for ``from``'s tokens of at least
     * `amount`.
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public virtual override returns (bool) {
        address spender = msg.sender;
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
    }

    /**
     * @dev Moves `amount` of SCI tokens from `from` to `to`.
     *
     * This internal function is equivalent to {transfer}, and can be used to
     * e.g. implement automatic token fees, slashing mechanisms, etc.
     *
     * Emits a {Transfer} event.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     * - `from` must have a balance of at least `amount`.
     */
    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");
        uint256 fromBalance = balanceOf(from);
        require(
            fromBalance >= amount,
            "ERC20: transfer amount exceeds balance"
        );

        unchecked {
            _balances[uint64(SCI)][from] = fromBalance - amount;
        }
        _balances[uint64(SCI)][to] += amount;

        emit Transfer(from, to, amount);
    }

    /**
     * @dev Destroys `amount` SCI tokens for msg.sender, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     *
     * - sender cannot be the zero address.
     * - sender must have at least `amount` tokens.
     */
    function burn(uint256 amount) external {
        uint256 accountBalance = balanceOf(msg.sender);
        require(accountBalance >= amount, "ERC20: burn amount exceeds balance");
        unchecked {
            _totalSupply -= amount;
            _balances[uint64(SCI)][msg.sender] = accountBalance - amount;
        }
        emit Transfer(msg.sender, address(0), amount);
    }

    /**
     * @dev Sets `amount` as the allowance of `spender` over the `owner` s tokens.
     *
     * This internal function is equivalent to `approve`, and can be used to
     * e.g. set automatic allowances for certain subsystems, etc.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     */
    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");
        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    /**
     * @dev Updates `owner` s allowance for `spender` based on spent `amount`.
     *
     * Does not update the allowance amount in case of infinite allowance.
     * Revert if not enough allowance is available.
     *
     * Might emit an {Approval} event.
     */
    function _spendAllowance(
        address owner,
        address spender,
        uint256 amount
    ) internal virtual {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance != type(uint256).max) {
            require(
                currentAllowance >= amount,
                "ERC20: insufficient allowance"
            );
            unchecked {
                _approve(owner, spender, currentAllowance - amount);
            }
        }
    }

    /**
     * @dev See {IERC1155MetadataURI-uri}.
     *
     * This implementation returns the same URI for *all* token types. It relies
     * on the token type ID substitution mechanism
     * https://eips.ethereum.org/EIPS/eip-1155#metadata[defined in the EIP].
     *
     * Clients calling this function must replace the `\{id\}` substring with the
     * actual token type ID.
     */
    function uri(uint256) public view virtual returns (string memory) {
        return _uri;
    }

    /**
     * @dev See {IERC1155-balanceOf}.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function balanceOf(
        address account,
        uint256 id
    ) public view virtual returns (uint256) {
        require(
            account != address(0),
            "ERC1155: address zero is not a valid owner"
        );
        return _balances[uint64(id)][account];
    }

    /**
     * @dev See {IERC1155-balanceOfBatch}.
     *
     * Requirements:
     *
     * - `accounts` and `ids` must have the same length.
     */
    function balanceOfBatch(
        address[] memory accounts,
        uint256[] memory ids
    ) public view virtual returns (uint256[] memory) {
        require(
            accounts.length == ids.length,
            "ERC1155: accounts and ids length mismatch"
        );

        uint256[] memory batchBalances = new uint256[](accounts.length);

        for (uint256 i = 0; i < accounts.length; ++i) {
            batchBalances[i] = balanceOf(accounts[i], ids[i]);
        }

        return batchBalances;
    }

    /**
     * @dev See {IERC1155-setApprovalForAll}.
     */
    function setApprovalForAll(address operator, bool approved) public virtual {
        _setApprovalForAll(msg.sender, operator, approved);
    }

    /**
     * @dev See {IERC1155-isApprovedForAll}.
     */
    function isApprovedForAll(
        address account,
        address operator
    ) public view virtual returns (bool) {
        return _operatorApprovals[account][operator];
    }

    /**
     * @dev batch version of setApprovalForAll
     */
    function setApprovalForAllBatch(
        address[] memory operators,
        bool[] memory approvals
    ) public virtual {
        require(
            operators.length == approvals.length,
            "operators and approvals length mismatch"
        );
        for (uint256 i = 0; i < approvals.length; ++i) {
            _setApprovalForAll(msg.sender, operators[i], approvals[i]);
        }
    }

    /**
     * @dev batch version of isApprovedForAll
     */
    function isApprovedForAllBatch(
        address[] memory accounts,
        address[] memory operators
    ) public view virtual returns (bool[] memory) {
        require(
            accounts.length == operators.length,
            "accounts and operators length mismatch"
        );
        bool[] memory approvals = new bool[](accounts.length);
        for (uint256 i = 0; i < accounts.length; ++i) {
            approvals[i] = isApprovedForAll(accounts[i], operators[i]);
        }
        return approvals;
    }

    /**
     * @dev Transfers `amount` tokens of token type `id` from `from` to `to`.
     *
     * Emits a {TransferSingle} event.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - `from` must have a balance of tokens of type `id` of at least `amount`.
     * - If `to` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155Received} and return the
     * acceptance magic value.
     */
    function _safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) internal virtual {
        require(to != address(0), "ERC1155: transfer to the zero address");

        address operator = msg.sender;

        uint256 fromBalance = _balances[uint64(id)][from];
        require(
            fromBalance >= amount,
            "ERC1155: insufficient balance for transfer"
        );
        unchecked {
            _balances[uint64(id)][from] = fromBalance - amount;
        }
        _balances[uint64(id)][to] += amount;

        emit TransferSingle(operator, from, to, id, amount);

        // -- WARNING --
        // This function allows arbitrary code execution, opening us to possible reentrancy attacks
        _doSafeTransferAcceptanceCheck(operator, from, to, id, amount, data);
    }

    /**
     * @dev xref:ROOT:erc1155.adoc#batch-operations[Batched] version of {_safeTransferFrom}.
     *
     * Emits a {TransferBatch} event.
     *
     * Requirements:
     *
     * - If `to` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155BatchReceived} and return the
     * acceptance magic value.
     */
    function _safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual {
        require(
            ids.length == amounts.length,
            "ERC1155: ids and amounts length mismatch"
        );
        require(to != address(0), "ERC1155: transfer to the zero address");

        address operator = msg.sender;

        for (uint256 i = 0; i < ids.length; ++i) {
            uint256 id = ids[i];
            uint256 amount = amounts[i];

            uint256 fromBalance = _balances[uint64(id)][from];
            require(
                fromBalance >= amount,
                "ERC1155: insufficient balance for transfer"
            );
            unchecked {
                _balances[uint64(id)][from] = fromBalance - amount;
            }
            _balances[uint64(id)][to] += amount;
        }

        emit TransferBatch(operator, from, to, ids, amounts);

        // -- WARNING --
        // note This function allows arbitrary code execution, opening us to possible reentrancy attacks
        _doSafeBatchTransferAcceptanceCheck(
            operator,
            from,
            to,
            ids,
            amounts,
            data
        );
    }

    /**
     * @dev Sets a new URI for all token types, by relying on the token type ID
     * substitution mechanism
     * https://eips.ethereum.org/EIPS/eip-1155#metadata[defined in the EIP].
     *
     * By this mechanism, any occurrence of the `\{id\}` substring in either the
     * URI or any of the amounts in the JSON file at said URI will be replaced by
     * clients with the token type ID.
     *
     * For example, the `https://token-cdn-domain/\{id\}.json` URI would be
     * interpreted by clients as
     * `https://token-cdn-domain/000000000000000000000000000000000000000000000000000000000004cce0.json`
     * for token type ID 0x4cce0.
     *
     * See {uri}.
     *
     * Because these URIs cannot be meaningfully represented by the {URI} event,
     * this function emits no events.
     */
    function _setURI(string memory newuri) internal virtual {
        _uri = newuri;
    }

    /**
     * @dev Creates `amount` tokens of token type `id`, and assigns them to `to`.
     *
     * Emits a {TransferSingle} event.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - If `to` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155Received} and return the
     * acceptance magic value.
     */
    function _mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) internal virtual {
        require(to != address(0), "ERC1155: mint to the zero address");

        address operator = msg.sender;

        _balances[uint64(id)][to] += amount;
        emit TransferSingle(operator, address(0), to, id, amount);

        // -- WARNING --
        // This function allows arbitrary code execution, opening us to possible reentrancy attacks
        _doSafeTransferAcceptanceCheck(
            operator,
            address(0),
            to,
            id,
            amount,
            data
        );
    }

    /**
     * @dev Approve `operator` to operate on all of `owner` tokens
     *
     * Emits an {ApprovalForAll} event.
     */
    function _setApprovalForAll(
        address owner,
        address operator,
        bool approved
    ) internal virtual {
        require(owner != operator, "ERC1155: setting approval status for self");
        _operatorApprovals[owner][operator] = approved;
        emit ApprovalForAll(owner, operator, approved);
    }

    function _doSafeTransferAcceptanceCheck(
        address operator,
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) private {
        // this check is openzeppelin's Address "isContract()"
        if (to.code.length > 0) {
            try
                // -- WARNING --
                // This function allows arbitrary code execution, opening us to possible reentrancy attacks
                IERC1155Receiver(to).onERC1155Received(
                    operator,
                    from,
                    id,
                    amount,
                    data
                )
            returns (bytes4 response) {
                if (response != IERC1155Receiver.onERC1155Received.selector) {
                    revert("ERC1155: ERC1155Receiver rejected tokens");
                }
            } catch Error(string memory reason) {
                revert(reason);
            } catch {
                revert("ERC1155: transfer to non-ERC1155Receiver implementer");
            }
        }
    }

    function _doSafeBatchTransferAcceptanceCheck(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) private {
        // this check is openzeppelin's Address "isContract()"
        if (to.code.length > 0) {
            try
                // -- WARNING --
                // This function allows arbitrary code execution, opening us to possible reentrancy attacks
                IERC1155Receiver(to).onERC1155BatchReceived(
                    operator,
                    from,
                    ids,
                    amounts,
                    data
                )
            returns (bytes4 response) {
                if (
                    response != IERC1155Receiver.onERC1155BatchReceived.selector
                ) {
                    revert("ERC1155: ERC1155Receiver rejected tokens");
                }
            } catch Error(string memory reason) {
                revert(reason);
            } catch {
                revert("ERC1155: transfer to non-ERC1155Receiver implementer");
            }
        }
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

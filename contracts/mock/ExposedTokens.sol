// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../TokensInterface.sol";
import "../Tokens.sol";

contract ExposedTokens is Tokens {
    constructor(
        string memory uri_,
        uint256 initialMiningYield,
        uint256 minimumMiningYield_,
        uint256 miningFee_,
        uint8 difficulty_,
        uint32 miningIntervalSeconds_,
        uint256 maxTotalSupply_,
        uint256 mintingFee_
    )
        Tokens(
            uri_,
            initialMiningYield,
            minimumMiningYield_,
            miningFee_,
            difficulty_,
            miningIntervalSeconds_,
            maxTotalSupply_,
            mintingFee_
        )
    {
        // Additional initialization for ExposedTokens, if needed
    }

    /**
     * @dev This function is only to let me get to 100% branch coverage
     *
     * each index will revert from a different internal function
     */

    function testInternal(uint256 index) external {
        if (index == 0) {
            _transfer(address(0), msg.sender, 1);
        } else if (index == 1) {
            _approve(address(0), msg.sender, 1);
        } else if (index == 2) {
            _safeTransferFrom(msg.sender, address(0), 0, 1, bytes(""));
        } else if (index == 3) {
            uint256[] memory ids = new uint256[](1);
            uint256[] memory amounts = new uint256[](1);
            ids[0] = 1;
            amounts[0] = 100;
            _safeBatchTransferFrom(
                msg.sender,
                address(0),
                ids,
                amounts,
                bytes("")
            );
        } else if (index == 4) {
            _mint(address(0), 0, 1, bytes(""));
        } else if (index == 5) {
            uint64 invalidNftId = 1000;
            appendNewContent(
                invalidNftId,
                keccak256("TEST"),
                TokensInterface.ContentType.ADMIN,
                uint64(block.timestamp)
            );
        } else {
            revert("Invalid test index");
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";

// this contract advertises as IERC1155Receiver and would return the
// expected signatures in onERC1155Received and onERC1155BatchReceived
// ... but we revert transactions instead

contract MockERC1155Reverting is IERC1155Receiver {
    /**
     * @dev ERC165 implementation
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165) returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IERC1155Receiver).interfaceId;
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        require(false, "contract always reverts");
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        require(false, "contract always reverts");
        return this.onERC1155BatchReceived.selector;
    }
}

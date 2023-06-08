// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

// Import target contract
import {Tokens} from "../../contracts/Tokens.sol";
// Import target contract interface
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Receiver.sol";

// Import Narya SDK base test
import "./Base.t.sol";
import {PTest} from "@narya-ai/contracts/PTest.sol";

contract TokensERC1155Test is TestBase, ERC1155Holder {
    IERC1155 token;

    address user1 = makeAddr("user");
    address user2 = makeAddr("user2");
    address agent;

    uint256 initialBalance;

    function setUp() public override {
        super.setUp();

        token = IERC1155(address(tokens));

        // Step 2: Grant user account gas, mine SCI, mint an NFT
        deal(user1, 10 ether);
        deal(user2, 10 ether);
        deal(agent, 10 ether);
    }

    function testMintToEOA() public {
        mintNFT(user1);

        assertEq(token.balanceOf(user1, 1), 1);
    }

    function testMintToERC1155Recipient() public {
        ERC1155Recipient to = new ERC1155Recipient();

        mintNFT(user1);
        vm.prank(user1);
        token.setApprovalForAll(address(this), true);
        // bytes32 data = keccak256("data");

        token.safeTransferFrom(user1, address(to), 1, 1, "");

        assertEq(token.balanceOf(address(to), 1), 1);

        assertEq(to.operator(), address(this));
        assertEq(to.from(), user1);
        assertEq(to.id(), 1);
    }

    // function testBurn() public {
    //     mintNFT(user1);

    //     token.burn(user1, 1, 70);

    //     assertEq(token.balanceOf(user1, 1337), 30);
    // }

    // function testBatchBurn() public {
    //     uint256[] memory ids = [1, 2, 3, 4, 5];
    //     uint256[] memory mintAmounts = [1, 1, 1, 1, 1];
    //     uint256[] memory burnAmounts = [1, 1, 1, 1, 1];

    //     token.batchMint(user1, ids, mintAmounts, "");

    //     token.batchBurn(user1, ids, burnAmounts);

    //     assertEq(token.balanceOf(user1, 1), 1);
    //     assertEq(token.balanceOf(user1, 2), 1);
    //     assertEq(token.balanceOf(user1, 3), 1);
    //     assertEq(token.balanceOf(user1, 4), 1);
    //     assertEq(token.balanceOf(user1, 5), 1);
    // }

    function testApproveAll() public {
        token.setApprovalForAll(user1, true);

        assertTrue(token.isApprovedForAll(address(this), user1));
    }

    function testSafeTransferFromToEOA() public {
        address from = address(0xABCD);
        deal(from, 10 ether);

        mintNFT(from);

        vm.prank(from);
        token.setApprovalForAll(address(this), true);

        token.safeTransferFrom(from, user1, 1, 1, "");

        assertEq(token.balanceOf(user1, 1), 1);
    }

    function testSafeTransferFromToERC1155Recipient() public {
        ERC1155Recipient to = new ERC1155Recipient();

        address from = address(0xABCD);
        deal(from, 10 ether);

        mintNFT(from);

        vm.prank(from);
        token.setApprovalForAll(address(this), true);

        token.safeTransferFrom(from, address(to), 1, 1, "testing 123");

        assertEq(to.operator(), address(this));
        assertEq(to.from(), from);
        assertEq(to.id(), 1);
        // assertBytesEq(to.mintData(), "testing 123");

        assertEq(token.balanceOf(address(to), 1), 1);
        assertEq(token.balanceOf(from, 1), 0);
    }

    function testSafeTransferFromSelf() public {
        mintNFT(address(this));

        token.safeTransferFrom(address(this), user1, 1, 1, "");

        assertEq(token.balanceOf(user1, 1), 1);
        assertEq(token.balanceOf(address(this), 1), 0);
    }

    function testSafeBatchTransferFromToEOA() public {
        address from = address(0xABCD);
        deal(from, 10 ether);

        uint256[] memory ids = new uint256[](5);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
        ids[3] = 4;
        ids[4] = 5;

        uint256[] memory mintAmounts = new uint256[](5);
        mintAmounts[0] = 1;
        mintAmounts[1] = 1;
        mintAmounts[2] = 1;
        mintAmounts[3] = 1;
        mintAmounts[4] = 1;

        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);

        vm.prank(from);
        token.setApprovalForAll(address(this), true);

        token.safeBatchTransferFrom(from, user1, ids, mintAmounts, "");

        assertEq(token.balanceOf(from, 1), 0);
        assertEq(token.balanceOf(user1, 1), 1);

        assertEq(token.balanceOf(from, 2), 0);
        assertEq(token.balanceOf(user1, 2), 1);

        assertEq(token.balanceOf(from, 3), 0);
        assertEq(token.balanceOf(user1, 3), 1);

        assertEq(token.balanceOf(from, 4), 0);
        assertEq(token.balanceOf(user1, 4), 1);

        assertEq(token.balanceOf(from, 5), 0);
        assertEq(token.balanceOf(user1, 5), 1);
    }

    function testBatchBalanceOf() public {
        address[] memory tos = new address[](5);
        tos[0] = user1;
        tos[1] = address(0xCAFE);
        tos[2] = address(0xFACE);
        tos[3] = address(0xDEAD);
        tos[4] = address(0xFEED);
        deal(address(0xCAFE), 10 ether);
        deal(address(0xFACE), 10 ether);
        deal(address(0xDEAD), 10 ether);
        deal(address(0xFEED), 10 ether);

        uint256[] memory ids = new uint256[](5);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
        ids[3] = 4;
        ids[4] = 5;

        mintNFT(user1);
        mintNFT(address(0xCAFE));
        mintNFT(address(0xFACE));
        mintNFT(address(0xDEAD));
        mintNFT(address(0xFEED));

        uint256[] memory balances = token.balanceOfBatch(tos, ids);

        assertEq(balances[0], 1);
        assertEq(balances[1], 1);
        assertEq(balances[2], 1);
        assertEq(balances[3], 1);
        assertEq(balances[4], 1);
    }

    // function testFailMintToZero() public {
    //     token.mint(address(0), 1337, 1, "");
    // }

    // function testFailMintToNonERC155Recipient() public {
    //     token.mint(address(new NonERC1155Recipient()), 1337, 1, "");
    // }

    // function testFailMintToRevertingERC155Recipient() public {
    //     token.mint(address(new RevertingERC1155Recipient()), 1337, 1, "");
    // }

    // function testFailMintToWrongReturnDataERC155Recipient() public {
    //     token.mint(address(new RevertingERC1155Recipient()), 1337, 1, "");
    // }

    // function testFailBurnInsufficientBalance() public {
    //     token.mint(user1, 1337, 70, "");
    //     token.burn(user1, 1337, 100);
    // }

    function testSafeTransferFromInsufficientBalance() public {
        address from = address(0xABCD);

        mintNFT(address(this));

        vm.prank(from);
        token.setApprovalForAll(address(this), true);

        vm.expectRevert("ERC1155: insufficient balance for transfer");
        token.safeTransferFrom(from, user1, 1, 1, "");
    }

    function testSafeTransferFromToZero() public {
        mintNFT(address(this));

        vm.expectRevert("ERC1155: transfer to the zero address");
        token.safeTransferFrom(address(this), address(0), 1, 1, "");
    }

    function testSafeTransferFromToNonERC155Recipient() public {
        mintNFT(address(this));

        NonERC1155Recipient nonERC1155Recipient = new NonERC1155Recipient();
        vm.expectRevert("ERC1155: transfer to non-ERC1155Receiver implementer");
        token.safeTransferFrom(
            address(this),
            address(nonERC1155Recipient),
            1,
            1,
            ""
        );
    }

    function testSafeTransferFromToRevertingERC1155Recipient() public {
        mintNFT(address(this));

        RevertingERC1155Recipient revertingERC1155Recipient = new RevertingERC1155Recipient();

        vm.expectRevert(0xf23a6e61);
        token.safeTransferFrom(
            address(this),
            address(revertingERC1155Recipient),
            1,
            1,
            ""
        );
    }

    function testSafeTransferFromToWrongReturnDataERC1155Recipient() public {
        mintNFT(address(this));

        WrongReturnDataERC1155Recipient wrdERC1155Recipient = new WrongReturnDataERC1155Recipient();
        vm.expectRevert("ERC1155: ERC1155Receiver rejected tokens");
        token.safeTransferFrom(
            address(this),
            address(wrdERC1155Recipient),
            1,
            1,
            ""
        );
    }

    function testSafeBatchTransferInsufficientBalance() public {
        address from = address(0xABCD);
        deal(from, 10 ether);

        uint256[] memory ids = new uint256[](5);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
        ids[3] = 4;
        ids[4] = 5;

        uint256[] memory mintAmounts = new uint256[](5);
        mintAmounts[0] = 1;
        mintAmounts[1] = 1;
        mintAmounts[2] = 1;
        mintAmounts[3] = 1;
        mintAmounts[4] = 2;

        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);

        vm.prank(from);
        token.setApprovalForAll(address(this), true);

        vm.expectRevert("ERC1155: insufficient balance for transfer");
        token.safeBatchTransferFrom(from, user1, ids, mintAmounts, "");
    }

    function testSafeBatchTransferFromToZero() public {
        address from = address(0xABCD);
        deal(from, 10 ether);

        uint256[] memory ids = new uint256[](5);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
        ids[3] = 4;
        ids[4] = 5;

        uint256[] memory mintAmounts = new uint256[](5);
        mintAmounts[0] = 1;
        mintAmounts[1] = 1;
        mintAmounts[2] = 1;
        mintAmounts[3] = 1;
        mintAmounts[4] = 1;

        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);

        vm.prank(from);
        token.setApprovalForAll(address(this), true);

        vm.expectRevert("ERC1155: transfer to the zero address");
        token.safeBatchTransferFrom(from, address(0), ids, mintAmounts, "");
    }

    function testSafeBatchTransferFromToNonERC1155Recipient() public {
        address from = address(0xABCD);
        deal(from, 10 ether);

        uint256[] memory ids = new uint256[](5);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
        ids[3] = 4;
        ids[4] = 5;

        uint256[] memory mintAmounts = new uint256[](5);
        mintAmounts[0] = 1;
        mintAmounts[1] = 1;
        mintAmounts[2] = 1;
        mintAmounts[3] = 1;
        mintAmounts[4] = 1;

        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);

        vm.prank(from);
        token.setApprovalForAll(address(this), true);

        NonERC1155Recipient nonERC1155Recipient = new NonERC1155Recipient();
        vm.expectRevert("ERC1155: transfer to non-ERC1155Receiver implementer");
        token.safeBatchTransferFrom(
            from,
            address(nonERC1155Recipient),
            ids,
            mintAmounts,
            ""
        );
    }

    function testSafeBatchTransferFromToRevertingERC1155Recipient() public {
        address from = address(0xABCD);
        deal(from, 10 ether);

        uint256[] memory ids = new uint256[](5);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
        ids[3] = 4;
        ids[4] = 5;

        uint256[] memory mintAmounts = new uint256[](5);
        mintAmounts[0] = 1;
        mintAmounts[1] = 1;
        mintAmounts[2] = 1;
        mintAmounts[3] = 1;
        mintAmounts[4] = 1;

        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);

        vm.prank(from);
        token.setApprovalForAll(address(this), true);

        RevertingERC1155Recipient revertingERC1155Recipient = new RevertingERC1155Recipient();

        vm.expectRevert(0xbc197c81);
        token.safeBatchTransferFrom(
            from,
            address(revertingERC1155Recipient),
            ids,
            mintAmounts,
            ""
        );
    }

    function testSafeBatchTransferFromToWrongReturnDataERC1155Recipient()
        public
    {
        address from = address(0xABCD);
        vm.deal(from, 10 ether);

        uint256[] memory ids = new uint256[](5);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
        ids[3] = 4;
        ids[4] = 5;

        uint256[] memory mintAmounts = new uint256[](5);
        mintAmounts[0] = 1;
        mintAmounts[1] = 1;
        mintAmounts[2] = 1;
        mintAmounts[3] = 1;
        mintAmounts[4] = 1;

        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);

        vm.prank(from);
        token.setApprovalForAll(address(this), true);

        WrongReturnDataERC1155Recipient wrdERC1155Recipient = new WrongReturnDataERC1155Recipient();
        vm.expectRevert("ERC1155: ERC1155Receiver rejected tokens");
        token.safeBatchTransferFrom(
            from,
            address(wrdERC1155Recipient),
            ids,
            mintAmounts,
            ""
        );
    }

    function testSafeBatchTransferFromWithArrayLengthMismatch() public {
        address from = address(0xABCD);
        vm.deal(from, 10 ether);

        uint256[] memory ids = new uint256[](5);
        ids[0] = 1;
        ids[1] = 2;
        ids[2] = 3;
        ids[3] = 4;
        ids[4] = 5;

        uint256[] memory mintAmounts = new uint256[](4);
        mintAmounts[0] = 1;
        mintAmounts[1] = 1;
        mintAmounts[2] = 1;
        mintAmounts[3] = 1;

        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);
        mintNFT(from);

        vm.prank(from);
        token.setApprovalForAll(address(this), true);

        vm.expectRevert("ERC1155: ids and amounts length mismatch");
        token.safeBatchTransferFrom(from, user1, ids, mintAmounts, "");
    }

    // function testFailBatchMintToZero() public {
    //     uint256[] memory ids = [1, 2, 3, 4, 5];
    //     uint256[] memory mintAmounts = [1, 1, 1, 1, 1];

    //     token.batchMint(address(0), ids, mintAmounts, "");
    // }

    // function testFailBatchMintToNonERC1155Recipient() public {
    //     NonERC1155Recipient to = new NonERC1155Recipient();

    //     uint256[] memory ids = [1, 2, 3, 4, 5];
    //     uint256[] memory mintAmounts = [1, 1, 1, 1, 1];
    //     uint256[] memory burnAmounts = [1, 1, 1, 1, 1];

    //     token.batchMint(address(to), ids, mintAmounts, "");
    // }

    // function testFailBatchMintToRevertingERC1155Recipient() public {
    //     RevertingERC1155Recipient to = new RevertingERC1155Recipient();

    //     uint256[] memory ids = [1, 2, 3, 4, 5];
    //     uint256[] memory mintAmounts = [1, 1, 1, 1, 1];

    //     token.batchMint(address(to), ids, mintAmounts, "");
    // }

    // function testFailBatchMintToWrongReturnDataERC1155Recipient() public {
    //     WrongReturnDataERC1155Recipient to = new WrongReturnDataERC1155Recipient();

    //     uint256[] memory ids = [1, 2, 3, 4, 5];
    //     uint256[] memory mintAmounts = [1, 1, 1, 1, 1];

    //     token.batchMint(address(to), ids, mintAmounts, "");
    // }

    // function testFailBatchMintWithArrayMismatch() public {
    //     uint256[] memory ids = [1, 2, 3, 4, 5];
    //     uint256[] memory mintAmounts = [1, 1, 1, 1, 1];

    //     token.batchMint(user1, ids, mintAmounts, "");
    // }

    // function testFailBatchBurnInsufficientBalance() public {
    //     uint256[] memory ids = [1, 2, 3, 4, 5];
    //     uint256[] memory mintAmounts = [1, 1, 1, 1, 1];
    //     uint256[] memory burnAmounts = [1, 1, 1, 1, 1];

    //     token.batchMint(user1, ids, mintAmounts, "");

    //     token.batchBurn(user1, ids, burnAmounts);
    // }

    // function testFailBatchBurnWithArrayLengthMismatch() public {
    //     uint256[] memory ids = [1, 2, 3, 4, 5];
    //     uint256[] memory mintAmounts = [1, 1, 1, 1, 1];
    //     uint256[] memory burnAmounts = [1, 1, 1, 1, 1];

    //     token.batchMint(user1, ids, mintAmounts, "");

    //     token.batchBurn(user1, ids, burnAmounts);
    // }

    function testBalanceOfBatchWithArrayMismatch() public {
        address[] memory tos = new address[](5);
        tos[0] = user1;
        tos[1] = address(0xCAFE);
        tos[2] = address(0xFACE);
        tos[3] = address(0xDEAD);
        tos[4] = address(0xFEED);

        uint256[] memory ids = new uint256[](4);
        ids[0] = 1337;
        ids[1] = 1338;
        ids[2] = 1339;
        ids[3] = 1340;

        vm.expectRevert("ERC1155: accounts and ids length mismatch");
        token.balanceOfBatch(tos, ids);
    }
}

// HELPERS //
contract ERC1155Recipient is ERC1155Holder {
    address public operator;
    address public from;
    uint256 public id;
    uint256 public amount;
    bytes public mintData;

    function onERC1155Received(
        address _operator,
        address _from,
        uint256 _id,
        uint256 _amount,
        bytes memory _data
    ) public override returns (bytes4) {
        operator = _operator;
        from = _from;
        id = _id;
        amount = _amount;
        mintData = _data;

        return ERC1155Holder.onERC1155Received.selector;
    }

    address public batchOperator;
    address public batchFrom;
    uint256[] internal _batchIds;
    uint256[] internal _batchAmounts;
    bytes public batchData;

    function batchIds() external view returns (uint256[] memory) {
        return _batchIds;
    }

    function batchAmounts() external view returns (uint256[] memory) {
        return _batchAmounts;
    }

    function onERC1155BatchReceived(
        address _operator,
        address _from,
        uint256[] memory _ids,
        uint256[] memory _amounts,
        bytes memory _data
    ) public override returns (bytes4) {
        batchOperator = _operator;
        batchFrom = _from;
        _batchIds = _ids;
        _batchAmounts = _amounts;
        batchData = _data;

        return ERC1155Holder.onERC1155BatchReceived.selector;
    }
}

contract RevertingERC1155Recipient is ERC1155Holder {
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public pure override returns (bytes4) {
        revert(
            string(abi.encodePacked(ERC1155Holder.onERC1155Received.selector))
        );
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public pure override returns (bytes4) {
        revert(
            string(
                abi.encodePacked(ERC1155Holder.onERC1155BatchReceived.selector)
            )
        );
    }
}

contract WrongReturnDataERC1155Recipient is ERC1155Holder {
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public pure override returns (bytes4) {
        return 0xCAFEBEEF;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public pure override returns (bytes4) {
        return 0xCAFEBEEF;
    }
}

contract NonERC1155Recipient {}

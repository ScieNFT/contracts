// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Base.t.sol";

// Import string utilities
import "@openzeppelin/contracts/utils/Strings.sol";

// A test contract, needs to extends `PTest`
// Contract name could be anything
contract TokenLossTest is TestBase {
    address USER = makeAddr("user");
    address agent;

    string uri = "https://www.scienft.com/{id}.json";

    uint256 initialBalance;

    function setUp() public override {
        super.setUp();

        // Step 2: Grant user account gas, mine SCI, mint an NFT
        deal(USER, 10 ether);

        mint(USER);

        mintNFT(USER);

        // Step 3: Grant agent account gas, and deposit it into the vault
        agent = getAgent(); // Initialize the field
        deal(agent, 10 ether);

        // record initial SCI token balance for USER
        initialBalance = tokens.balanceOf(USER);
    }

    // function actionUserTransfer() public {
    //     vm.startPrank()
    // }

    // should eventually fail
    // * we do not allow burning or multiple issuance for an NFT, but we allow transfers
    function invariantStaticNFTAmount() public view {
        assert(tokens.balanceOf(USER, tokens.FIRST_NFT()) == 1);
    }

    // should eventually fail
    // * the total amount of SCI tokens can go down (via burn) or up (via mining)
    function invariantStaticTotalSupply() public view {
        assert(tokens.balanceOf(USER) == initialBalance);
        // assert(tokens.totalSupply() == initialBalance);
    }

    // should pass
    function invariantMaxTotalSupply() public view {
        // assert(tokens.balanceOf(USER) == initialBalance);
        assert(tokens.totalSupply() <= maxTotalSupply);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Base.t.sol";
// Import string utilities
import "@openzeppelin/contracts/utils/Strings.sol";

contract TokensFeeTest is TestBase {
    address USER = makeAddr("user");

    string uri = "https://www.scienft.com/{id}.json";

    bytes32 solution;

    function setUp() public override {
        super.setUp();
    }

    function testMiningFee(uint256 _fee) external {
        vm.startPrank(cfo);
        tokens.setMiningFee(_fee);
        vm.stopPrank();
    }
}

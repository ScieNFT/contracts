// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Tokens} from "../../contracts/Tokens.sol";
import {PTest, console} from "@narya-ai/contracts/PTest.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract TestBase is PTest {
    Tokens public tokens;
    address public ceo;
    address public cfo;

    string public constant CONTRACT_DEPLOYMENT_URI =
        "http://www.scienft.com/token-{id}.json";
    uint256 public initialMiningYield = 100;
    uint256 public minimumMiningYield = 1;
    uint256 public maxTotalSupply = 1000;
    uint32 public miningIntervalSeconds = 10;
    uint256 public miningFee = 0.001 ether;
    uint8 difficulty = 1;
    uint256 mintingFee = 0.001 ether;

    function setUp() public virtual {
        ceo = makeAddr("CEO");
        cfo = makeAddr("CFO");

        vm.startPrank(ceo);
        tokens = new Tokens(
            CONTRACT_DEPLOYMENT_URI,
            initialMiningYield,
            minimumMiningYield,
            miningFee,
            difficulty,
            miningIntervalSeconds,
            maxTotalSupply,
            mintingFee
        );
        tokens.grantRole(tokens.CFO_ROLE(), cfo);
        vm.stopPrank();
    }

    function mint(address to) public {
        uint256 i;
        bytes32 solution;
        do {
            solution = keccak256(
                bytes(string.concat("guess", Strings.toString(i)))
            );
            ++i;
        } while (!tokens.isCorrect(solution));

        skip(miningIntervalSeconds + 1);

        vm.startPrank(to);
        tokens.mineSCI{value: 0.001 ether}(solution, payable(to));
        vm.stopPrank();
    }

    function mintNFT(address to) public {
        require(
            to.balance > 0.001 ether,
            "address balance must be higher than 0.001"
        );
        bytes32 contentHash = keccak256("contentHash");

        vm.startPrank(to);
        tokens.mintNFT{value: mintingFee}(contentHash, uint64(1), to, to, to);
        vm.stopPrank();
    }
}

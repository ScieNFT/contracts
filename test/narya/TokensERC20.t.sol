// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

// Import target contract
import "./Base.t.sol";
// Import target contract interface
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// Import string utilities
import "@openzeppelin/contracts/utils/Strings.sol";
import {TokensInterface} from "../../contracts/TokensInterface.sol";
// Import Narya SDK base test
import {PTest, console} from "@narya-ai/contracts/PTest.sol";

contract TokensERC20Test is TestBase {
    IERC20 token;

    address user1 = makeAddr("user");
    address user2 = makeAddr("user2");
    address agent = makeAddr("agent");

    uint256 initialBalance;

    function setUp() public override {
        super.setUp();

        token = IERC20(address(tokens));

        // Step 2: Grant user account gas, mine SCI, mint an NFT
        deal(user1, 10 ether);
        deal(user2, 10 ether);

        mint(user1);
    }

    function testMint() public {
        uint256 totalSupply = token.totalSupply();
        uint256 userBalance = token.balanceOf(user1);
        uint256 miningYield = tokens.miningYield();

        super.mint(user1);

        assertEq(token.totalSupply(), totalSupply + miningYield);
        assertEq(token.balanceOf(user1), userBalance + miningYield);
    }

    function testBurn() public {
        uint256 totalSupply = token.totalSupply();
        uint256 userBalance = token.balanceOf(user1);

        vm.startPrank(user1);
        tokens.burn(userBalance / 2);
        vm.stopPrank();

        assertEq(token.totalSupply(), totalSupply - userBalance / 2);
        assertEq(token.balanceOf(user1), userBalance / 2);
    }

    function testApprove() public {
        assertTrue(token.approve(user1, 1e18));

        assertEq(token.allowance(address(this), user1), 1e18);
    }

    function testTransfer() public {
        uint256 totalSupply = token.totalSupply();
        uint256 userBalance = token.balanceOf(user1);

        vm.startPrank(user1);
        assertTrue(token.transfer(user2, userBalance / 2));
        assertEq(token.totalSupply(), totalSupply);

        assertEq(token.balanceOf(user1), userBalance / 2);
        assertEq(token.balanceOf(user2), userBalance / 2);
    }

    function testTransferFrom() public {
        uint256 totalSupply = token.totalSupply();
        uint256 miningYield = tokens.miningYield();

        super.mint(user2);

        vm.prank(user2);
        token.approve(user1, miningYield);
        console.log(token.allowance(user2, user1));

        vm.prank(user1);
        token.transferFrom(user2, user1, miningYield);
        assertEq(token.totalSupply(), totalSupply + miningYield);

        assertEq(token.allowance(user2, user1), 0);

        assertEq(token.balanceOf(user2), 0);
        assertEq(token.balanceOf(user1), totalSupply + miningYield);
    }

    function testInfiniteApproveTransferFrom() public {
        uint256 totalSupply = token.totalSupply();
        uint256 miningYield = tokens.miningYield();

        super.mint(user2);

        vm.prank(user2);
        token.approve(address(this), type(uint256).max);

        assertTrue(token.transferFrom(user2, user1, miningYield));
        assertEq(token.totalSupply(), totalSupply + miningYield);

        assertEq(token.allowance(user2, address(this)), type(uint256).max);

        assertEq(token.balanceOf(user2), 0);
        assertEq(token.balanceOf(user1), totalSupply + miningYield);
    }

    function testTransferInsufficientBalance() public {
        vm.expectRevert("ERC20: transfer amount exceeds balance");
        token.transfer(user1, 1e18);
    }

    function testTransferFromInsufficientAllowance() public {
        address from = address(0xABCD);
        vm.prank(from);
        token.approve(address(this), 0.9e18);

        vm.expectRevert("ERC20: insufficient allowance");
        token.transferFrom(from, user1, 1e18);
    }

    function testTransferFromInsufficientBalance() public {
        address from = address(0xABCD);

        // token.mint(from, 0.9e18);

        vm.prank(from);
        token.approve(address(this), 1e18);

        vm.expectRevert("ERC20: transfer amount exceeds balance");

        token.transferFrom(from, user1, 1e18);
    }

    function testBurn(address from) public {
        vm.assume(from != address(0));

        vm.deal(from, 10 ether);
        super.mint(from);
        uint256 userBalance = token.balanceOf(from);

        // token.mint(from, mintAmount);
        vm.startPrank(from);
        uint totalBalance = token.totalSupply();
        TokensInterface(address(token)).burn(userBalance);

        assertEq(token.totalSupply(), totalBalance - userBalance);
        assertEq(token.balanceOf(from), 0);
    }

    function testApprove(address to, uint256 amount) public {
        vm.assume(to != address(0));
        assertTrue(token.approve(to, amount));

        assertEq(token.allowance(address(this), to), amount);
    }

    function testTransfer(address from) public {
        vm.assume(from != address(0));
        super.mint(user1);
        uint balance = token.balanceOf(user1);

        vm.prank(user1);
        token.transfer(from, balance);
        assertEq(token.totalSupply(), balance);

        if (address(this) == from) {
            assertEq(token.balanceOf(user1), balance);
        } else {
            assertEq(token.balanceOf(user1), 0);
            assertEq(token.balanceOf(from), balance);
        }
    }
}

// contract ERC20Invariants is PTest {
//     BalanceSum balanceSum;
//     MockERC20 token;

//     function setUp() public {
//         token = new MockERC20("Token", "TKN", 18);
//         balanceSum = new BalanceSum(token);

//         addTargetContract(address(balanceSum));
//     }

//     function invariantBalanceSum() public {
//         assertEq(token.totalSupply(), balanceSum.sum());
//     }
// }

contract BalanceSum {
    IERC20 token;
    uint256 public sum;

    constructor(IERC20 _token) {
        token = _token;
    }

    function mint(address from, uint256 amount) public {
        // token.mint(from, amount);
        sum += amount;
    }

    function burn(address from, uint256 amount) public {
        // token.burn(from, amount);
        sum -= amount;
    }

    function approve(address to, uint256 amount) public {
        token.approve(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public {
        token.transferFrom(from, to, amount);
    }

    function transfer(address to, uint256 amount) public {
        token.transfer(to, amount);
    }
}

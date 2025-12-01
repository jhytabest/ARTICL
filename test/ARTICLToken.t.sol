// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ARTICL} from "../src/ARTICL.sol";

contract ARTICLTokenTest is Test {
    ARTICL public token;
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);

    function setUp() public {
        token = new ARTICL();
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function testMintAndRedeemFlow() public {
        vm.startPrank(alice);
        uint256 minted = token.mint{value: 1 ether}(alice);
        assertEq(minted, 100_000_000);
        assertEq(token.balanceOf(alice), 100_000_000);
        assertEq(address(token).balance, 1 ether);

        uint256 aliceEthBefore = alice.balance;
        uint256 ethOut = token.redeem(50_000_000, payable(alice));
        vm.stopPrank();

        assertEq(ethOut, 0.5 ether);
        assertEq(alice.balance, aliceEthBefore + 0.5 ether);
        assertEq(token.balanceOf(alice), 50_000_000);
        assertEq(address(token).balance, 0.5 ether);
        assertEq(token.totalSupply(), 50_000_000);
    }

    function testTransferAndAllowance() public {
        vm.prank(alice);
        token.mint{value: 1 ether}(alice);

        vm.prank(alice);
        token.approve(bob, 20_000_000);

        vm.prank(bob);
        token.transferFrom(alice, bob, 15_000_000);

        assertEq(token.balanceOf(alice), 85_000_000);
        assertEq(token.balanceOf(bob), 15_000_000);
        assertEq(token.allowance(alice, bob), 5_000_000);
    }

    function testRevertWhenMintTooSmall() public {
        vm.prank(alice);
        vm.expectRevert(ARTICL.MintWouldCreateZeroTokens.selector);
        token.mint{value: 1}(alice);
    }

    function testRevertWhenTransferZeroAmount() public {
        vm.prank(alice);
        token.mint{value: 1 ether}(alice);

        vm.prank(alice);
        vm.expectRevert(ARTICL.ZeroAmount.selector);
        token.transfer(bob, 0);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ARTICL} from "../src/ARTICL.sol";

contract ARTICLTokenTest is Test {
    ARTICL public token;
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public charlie = address(0xC0C);

    // Mirror ERC20 Transfer event for expectEmit
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Minted(address indexed minter, uint256 ethIn, uint256 tokenOut);
    event Redeemed(address indexed redeemer, address indexed to, uint256 burned, uint256 ethOut);

    function setUp() public {
        token = new ARTICL();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
    }

    // ============ Existing Tests ============

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

    function testTransferZeroAmountAllowed() public {
        vm.prank(alice);
        token.mint{value: 1 ether}(alice);

        vm.expectEmit(true, true, false, true);
        emit Transfer(alice, bob, 0);
        vm.prank(alice);
        token.transfer(bob, 0);

        assertEq(token.balanceOf(alice), 100_000_000);
        assertEq(token.balanceOf(bob), 0);
    }

    function testTransferToZeroAddressReverts() public {
        vm.prank(alice);
        token.mint{value: 1 ether}(alice);

        vm.prank(alice);
        vm.expectRevert(ARTICL.ZeroAddress.selector);
        token.transfer(address(0), 1000);
    }

    function testTransferFromToZeroAddressReverts() public {
        vm.prank(alice);
        token.mint{value: 1 ether}(alice);

        vm.prank(alice);
        token.approve(bob, 10_000_000);

        vm.prank(bob);
        vm.expectRevert(ARTICL.ZeroAddress.selector);
        token.transferFrom(alice, address(0), 1000);
    }

    function testTransferFromZeroAmountPreservesAllowance() public {
        vm.prank(alice);
        token.mint{value: 1 ether}(alice);

        vm.prank(alice);
        token.approve(bob, 10_000_000);

        vm.expectEmit(true, true, false, true);
        emit Transfer(alice, bob, 0);
        vm.prank(bob);
        token.transferFrom(alice, bob, 0);

        assertEq(token.balanceOf(alice), 100_000_000);
        assertEq(token.balanceOf(bob), 0);
        assertEq(token.allowance(alice, bob), 10_000_000);
    }

    // ============ Edge Case: Mint ============

    /// @dev Fuzz: mint with varying ETH amounts including dust near rounding boundary
    function testFuzz_MintVaryingAmounts(uint256 ethAmount) public {
        // Bound to reasonable range: minimum 10 gwei (1 token), max 100 ETH
        ethAmount = bound(ethAmount, 10 gwei, 100 ether);

        vm.deal(alice, ethAmount);
        vm.prank(alice);
        uint256 minted = token.mint{value: ethAmount}(alice);

        uint256 expectedMinted = (ethAmount * 1e8) / 1 ether;
        assertEq(minted, expectedMinted, "minted amount mismatch");
        assertEq(token.balanceOf(alice), expectedMinted);
        assertEq(token.totalSupply(), expectedMinted);

        // ETH backing invariant: contract holds exactly what's needed
        uint256 ethRequired = (expectedMinted * 1 ether) / 1e8;
        assertEq(address(token).balance, ethRequired, "ETH backing mismatch");

        // Dust that cannot mint a full token should be refunded to minter
        uint256 refund = ethAmount - ethRequired;
        assertEq(alice.balance, refund, "refund amount mismatch");
    }

    /// @dev Mint refund logic: ETH that doesn't divide evenly should refund dust
    function testMintRefundsDust() public {
        // 1 ether + 5 gwei → should mint 100_000_000 tokens, refund 5 gwei
        uint256 sendAmount = 1 ether + 5 gwei;
        vm.deal(alice, sendAmount);

        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        uint256 minted = token.mint{value: sendAmount}(alice);

        assertEq(minted, 100_000_000);
        // Refund = 5 gwei (less than 10 gwei = 1 token worth)
        assertEq(alice.balance, aliceBalBefore - 1 ether, "dust not refunded correctly");
        assertEq(address(token).balance, 1 ether);
    }

    /// @dev Mint to a different address than msg.sender
    function testMintToDifferentRecipient() public {
        vm.prank(alice);
        uint256 minted = token.mint{value: 1 ether}(bob);

        assertEq(minted, 100_000_000);
        assertEq(token.balanceOf(bob), 100_000_000);
        assertEq(token.balanceOf(alice), 0);
    }

    /// @dev Mint to zero address reverts
    function testMintToZeroAddressReverts() public {
        vm.prank(alice);
        vm.expectRevert(ARTICL.ZeroAddress.selector);
        token.mint{value: 1 ether}(address(0));
    }

    /// @dev Mint at exact boundary: 9 gwei → 0 tokens → revert
    function testMintAtBoundary9GweiReverts() public {
        vm.prank(alice);
        vm.expectRevert(ARTICL.MintWouldCreateZeroTokens.selector);
        token.mint{value: 9 gwei}(alice);
    }

    /// @dev Mint at exact boundary: 10 gwei → 1 token
    function testMintAtBoundary10GweiSucceeds() public {
        vm.prank(alice);
        uint256 minted = token.mint{value: 10 gwei}(alice);
        assertEq(minted, 1);
        assertEq(address(token).balance, 10 gwei);
    }

    // ============ Edge Case: Redeem ============

    /// @dev Fuzz: redeem varying amounts
    function testFuzz_RedeemVaryingAmounts(uint256 redeemAmount) public {
        vm.prank(alice);
        token.mint{value: 10 ether}(alice);

        redeemAmount = bound(redeemAmount, 1, token.balanceOf(alice));

        uint256 aliceEthBefore = alice.balance;
        vm.prank(alice);
        uint256 ethOut = token.redeem(redeemAmount, payable(alice));

        uint256 expectedEth = (redeemAmount * 1 ether) / 1e8;
        assertEq(ethOut, expectedEth);
        assertEq(alice.balance, aliceEthBefore + expectedEth);
    }

    /// @dev Redeem entire balance → totalSupply = 0, contract ETH = 0
    function testRedeemEntireBalance() public {
        vm.prank(alice);
        token.mint{value: 5 ether}(alice);

        uint256 fullBalance = token.balanceOf(alice);

        vm.prank(alice);
        token.redeem(fullBalance, payable(alice));

        assertEq(token.totalSupply(), 0);
        assertEq(token.balanceOf(alice), 0);
        assertEq(address(token).balance, 0);
    }

    /// @dev Redeem zero amount reverts
    function testRedeemZeroReverts() public {
        vm.prank(alice);
        token.mint{value: 1 ether}(alice);

        vm.prank(alice);
        vm.expectRevert(ARTICL.ZeroAmount.selector);
        token.redeem(0, payable(alice));
    }

    /// @dev Redeem to zero address reverts
    function testRedeemToZeroAddressReverts() public {
        vm.prank(alice);
        token.mint{value: 1 ether}(alice);

        vm.prank(alice);
        vm.expectRevert(ARTICL.ZeroAddress.selector);
        token.redeem(1, payable(address(0)));
    }

    /// @dev Redeem more than balance reverts
    function testRedeemExceedingBalanceReverts() public {
        vm.prank(alice);
        token.mint{value: 1 ether}(alice);

        vm.prank(alice);
        vm.expectRevert(ARTICL.InsufficientBalance.selector);
        token.redeem(100_000_001, payable(alice));
    }

    /// @dev Multiple minters, one redeems — invariant: totalSupply * 1e10 == contract balance
    function testMultipleMintersThenRedeemInvariant() public {
        vm.prank(alice);
        token.mint{value: 3 ether}(alice);

        vm.prank(bob);
        token.mint{value: 2 ether}(bob);

        vm.prank(charlie);
        token.mint{value: 1 ether}(charlie);

        // Alice redeems half
        vm.prank(alice);
        token.redeem(150_000_000, payable(alice));

        // Invariant check
        uint256 expectedEth = (token.totalSupply() * 1 ether) / 1e8;
        assertEq(address(token).balance, expectedEth, "ETH backing invariant violated");
    }

    // ============ Edge Case: receive() ============

    /// @dev Direct ETH send to contract reverts
    function testReceiveReverts() public {
        vm.prank(alice);
        vm.expectRevert("Use mint");
        (bool success,) = address(token).call{value: 1 ether}("");
        // The revert happens inside receive(), but the low-level call catches it
        // Actually vm.expectRevert handles it
        success; // silence warning
    }

    // ============ Edge Case: Transfer ============

    /// @dev Transfer more than balance reverts
    function testTransferExceedingBalanceReverts() public {
        vm.prank(alice);
        token.mint{value: 1 ether}(alice);

        vm.prank(alice);
        vm.expectRevert(ARTICL.InsufficientBalance.selector);
        token.transfer(bob, 100_000_001);
    }

    /// @dev TransferFrom exceeding allowance reverts
    function testTransferFromExceedingAllowanceReverts() public {
        vm.prank(alice);
        token.mint{value: 1 ether}(alice);

        vm.prank(alice);
        token.approve(bob, 100);

        vm.prank(bob);
        vm.expectRevert(ARTICL.InsufficientAllowance.selector);
        token.transferFrom(alice, bob, 101);
    }

    /// @dev Max allowance (type(uint256).max) doesn't decrease on transferFrom
    function testMaxAllowanceNotDecreased() public {
        vm.prank(alice);
        token.mint{value: 1 ether}(alice);

        vm.prank(alice);
        token.approve(bob, type(uint256).max);

        vm.prank(bob);
        token.transferFrom(alice, bob, 50_000_000);

        assertEq(token.allowance(alice, bob), type(uint256).max);
    }

    // ============ Invariant: ETH Backing ============

    /// @dev After multiple mints and redeems, ETH backing always matches
    function testFuzz_EthBackingInvariant(uint256 mintAmount1, uint256 mintAmount2, uint256 redeemFraction) public {
        mintAmount1 = bound(mintAmount1, 10 gwei, 50 ether);
        mintAmount2 = bound(mintAmount2, 10 gwei, 50 ether);

        vm.deal(alice, mintAmount1);
        vm.prank(alice);
        token.mint{value: mintAmount1}(alice);

        vm.deal(bob, mintAmount2);
        vm.prank(bob);
        token.mint{value: mintAmount2}(bob);

        // Alice redeems a fraction
        uint256 aliceBalance = token.balanceOf(alice);
        if (aliceBalance > 0) {
            redeemFraction = bound(redeemFraction, 1, aliceBalance);
            vm.prank(alice);
            token.redeem(redeemFraction, payable(alice));
        }

        // Invariant
        uint256 expectedEth = (token.totalSupply() * 1 ether) / 1e8;
        assertEq(address(token).balance, expectedEth, "ETH backing invariant broken");
    }

    // ============ Constants ============

    function testConstants() public view {
        assertEq(token.name(), "ARTICL");
        assertEq(token.symbol(), "ARTICL");
        assertEq(token.decimals(), 0);
        assertEq(token.CONVERSION_FACTOR(), 1e8);
    }
}

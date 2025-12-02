// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ARTICL} from "../src/ARTICL.sol";
import {ARTICLMarketplace} from "../src/ARTICLMarketplace.sol";

contract ARTICLMarketplaceTest is Test {
    ARTICL public token;
    ARTICLMarketplace public market;

    uint256 internal publisherKey = 0xD00D;
    address internal publisher;

    uint256 internal buyerKey = 0xBEEF;
    address internal buyer;

    uint256 internal buyer2Key = 0xBEEF2;
    address internal buyer2;

    uint256 internal apiId;

    function setUp() public {
        token = new ARTICL();
        market = new ARTICLMarketplace(token);

        publisher = vm.addr(publisherKey);
        buyer = vm.addr(buyerKey);
        buyer2 = vm.addr(buyer2Key);

        vm.deal(publisher, 1 ether);
        vm.deal(buyer, 10 ether);
        vm.deal(buyer2, 10 ether);

        vm.startPrank(publisher);
        apiId = market.registerApi("Weather", "ipfs://metadata/weather", 123);
        vm.stopPrank();

        vm.startPrank(buyer);
        token.mint{value: 1 ether}(buyer);
        token.approve(address(market), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(buyer2);
        token.mint{value: 1 ether}(buyer2);
        token.approve(address(market), type(uint256).max);
        vm.stopPrank();
    }

    function testRegisterApiStoresMetadata() public {
        (address pubAddr, string memory name, string memory metadataURI, uint256 recommendedPrice, bool exists) =
            market.apis(apiId);

        assertTrue(exists);
        assertEq(pubAddr, publisher);
        assertEq(name, "Weather");
        assertEq(metadataURI, "ipfs://metadata/weather");
        assertEq(recommendedPrice, 123);
    }

    function testRedeemCallMovesFundsAndConsumesNonce() public {
        ARTICLMarketplace.SignedCall memory c =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 25_000_000, nonce: 1, signature: ""});

        c.signature = _sign(c, buyerKey);

        uint256 buyerBalanceBefore = token.balanceOf(buyer);
        uint256 publisherBalanceBefore = token.balanceOf(publisher);

        vm.prank(publisher);
        market.redeemCall(c);

        assertEq(token.balanceOf(buyer), buyerBalanceBefore - c.amount);
        assertEq(token.balanceOf(publisher), publisherBalanceBefore + c.amount);
        assertTrue(market.usedNonces(buyer, c.nonce));
    }

    function testRevertOnReplayNonce() public {
        ARTICLMarketplace.SignedCall memory c =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 10_000_000, nonce: 99, signature: ""});
        c.signature = _sign(c, buyerKey);

        vm.startPrank(publisher);
        market.redeemCall(c);
        vm.expectRevert(ARTICLMarketplace.NonceAlreadyUsed.selector);
        market.redeemCall(c);
        vm.stopPrank();
    }

    function testBatchRedeemAggregatesByBuyerAndPaysPublisher() public {
        ARTICLMarketplace.SignedCall[] memory calls = new ARTICLMarketplace.SignedCall[](2);
        calls[0] =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 30_000_000, nonce: 1, signature: ""});
        calls[1] = ARTICLMarketplace.SignedCall({
            buyer: buyer2,
            apiId: apiId,
            amount: 20_000_000,
            nonce: 2,
            signature: ""
        });

        calls[0].signature = _sign(calls[0], buyerKey);
        calls[1].signature = _sign(calls[1], buyer2Key);

        uint256 publisherBalanceBefore = token.balanceOf(publisher);

        vm.prank(publisher);
        market.redeemCalls(calls);

        assertEq(token.balanceOf(publisher), publisherBalanceBefore + 50_000_000);
        assertTrue(market.usedNonces(buyer, 1));
        assertTrue(market.usedNonces(buyer2, 2));
        // aggregated pulls once per buyer, but balances should be reduced by respective amounts
        assertEq(token.balanceOf(buyer), 100_000_000 - 30_000_000);
        assertEq(token.balanceOf(buyer2), 100_000_000 - 20_000_000);
    }

    function testBatchRedeemRevertsAtomicallyOnBadSignature() public {
        ARTICLMarketplace.SignedCall[] memory calls = new ARTICLMarketplace.SignedCall[](2);
        calls[0] =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 10_000_000, nonce: 3, signature: ""});
        calls[1] =
            ARTICLMarketplace.SignedCall({buyer: buyer2, apiId: apiId, amount: 10_000_000, nonce: 4, signature: ""});

        calls[0].signature = _sign(calls[0], buyerKey);
        // wrong signer on purpose
        calls[1].signature = _sign(calls[1], buyerKey);

        vm.prank(publisher);
        vm.expectRevert(ARTICLMarketplace.InvalidSignature.selector);
        market.redeemCalls(calls);

        assertEq(token.balanceOf(publisher), 0);
        assertFalse(market.usedNonces(buyer, 3));
        assertFalse(market.usedNonces(buyer2, 4));
    }

    function testBatchRedeemRevertsWhenAllowanceInsufficient() public {
        ARTICLMarketplace.SignedCall[] memory calls = new ARTICLMarketplace.SignedCall[](2);
        calls[0] =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 10_000_000, nonce: 5, signature: ""});
        calls[1] = ARTICLMarketplace.SignedCall({
            buyer: buyer2,
            apiId: apiId,
            amount: 90_000_000, // exceed allowance we will set
            nonce: 6,
            signature: ""
        });

        calls[0].signature = _sign(calls[0], buyerKey);
        calls[1].signature = _sign(calls[1], buyer2Key);

        vm.prank(buyer2);
        token.approve(address(market), 40_000_000);

        vm.prank(publisher);
        vm.expectRevert(ARTICL.InsufficientAllowance.selector);
        market.redeemCalls(calls);

        assertFalse(market.usedNonces(buyer, 5));
        assertFalse(market.usedNonces(buyer2, 6));
    }

    function testBatchRedeemRevertsOnDuplicateNonceInSameBatch() public {
        ARTICLMarketplace.SignedCall[] memory calls = new ARTICLMarketplace.SignedCall[](2);
        calls[0] =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 5_000_000, nonce: 7, signature: ""});
        calls[1] =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 6_000_000, nonce: 7, signature: ""});

        calls[0].signature = _sign(calls[0], buyerKey);
        calls[1].signature = _sign(calls[1], buyerKey);

        vm.prank(publisher);
        vm.expectRevert(ARTICLMarketplace.NonceAlreadyUsed.selector);
        market.redeemCalls(calls);

        assertFalse(market.usedNonces(buyer, 7));
    }

    // ============ Helpers ============

    function _sign(ARTICLMarketplace.SignedCall memory call, uint256 privateKey)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = market.hashCall(call.buyer, call.apiId, call.amount, call.nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}

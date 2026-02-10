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

    uint256 internal publisher2Key = 0xD00D2;
    address internal publisher2;

    uint256 internal buyerKey = 0xBEEF;
    address internal buyer;

    uint256 internal buyer2Key = 0xBEEF2;
    address internal buyer2;

    uint256 internal apiId;

    function setUp() public {
        token = new ARTICL();
        market = new ARTICLMarketplace(token);

        publisher = vm.addr(publisherKey);
        publisher2 = vm.addr(publisher2Key);
        buyer = vm.addr(buyerKey);
        buyer2 = vm.addr(buyer2Key);

        vm.deal(publisher, 1 ether);
        vm.deal(publisher2, 1 ether);
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

    // ============ Existing Tests ============

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
        calls[1].signature = _sign(calls[1], buyerKey); // wrong signer

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
            amount: 90_000_000,
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

    // ============ Edge Case: redeemCall ============

    /// @dev redeemCall with amount exceeding buyer balance reverts
    function testRedeemCallExceedingBalanceReverts() public {
        ARTICLMarketplace.SignedCall memory c = ARTICLMarketplace.SignedCall({
            buyer: buyer,
            apiId: apiId,
            amount: 200_000_000, // buyer only has 100M
            nonce: 10,
            signature: ""
        });
        c.signature = _sign(c, buyerKey);

        vm.prank(publisher);
        vm.expectRevert(ARTICL.InsufficientBalance.selector);
        market.redeemCall(c);
    }

    /// @dev redeemCall on non-existent apiId reverts
    function testRedeemCallNonExistentApiReverts() public {
        ARTICLMarketplace.SignedCall memory c =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: 999, amount: 1000, nonce: 11, signature: ""});
        c.signature = _sign(c, buyerKey);

        vm.prank(publisher);
        vm.expectRevert(ARTICLMarketplace.ApiDoesNotExist.selector);
        market.redeemCall(c);
    }

    /// @dev redeemCall with zero amount reverts
    function testRedeemCallZeroAmountReverts() public {
        ARTICLMarketplace.SignedCall memory c =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 0, nonce: 12, signature: ""});
        c.signature = _sign(c, buyerKey);

        vm.prank(publisher);
        vm.expectRevert(ARTICLMarketplace.AmountZero.selector);
        market.redeemCall(c);
    }

    // ============ Edge Case: updateApi ============

    /// @dev updateApi by non-publisher reverts
    function testUpdateApiByNonPublisherReverts() public {
        vm.prank(buyer);
        vm.expectRevert(ARTICLMarketplace.NotPublisher.selector);
        market.updateApi(apiId, "new-uri", 456);
    }

    /// @dev updateApi on non-existent api reverts
    function testUpdateApiNonExistentReverts() public {
        vm.prank(publisher);
        vm.expectRevert(ARTICLMarketplace.ApiDoesNotExist.selector);
        market.updateApi(999, "new-uri", 456);
    }

    /// @dev updateApi succeeds for publisher
    function testUpdateApiSucceeds() public {
        vm.prank(publisher);
        market.updateApi(apiId, "ipfs://new-metadata", 999);

        (, , string memory metadataURI, uint256 recommendedPrice, ) = market.apis(apiId);
        assertEq(metadataURI, "ipfs://new-metadata");
        assertEq(recommendedPrice, 999);
    }

    // ============ Edge Case: redeemCalls batch ============

    /// @dev redeemCalls with empty array is a no-op
    function testBatchRedeemEmptyArrayNoOp() public {
        ARTICLMarketplace.SignedCall[] memory calls = new ARTICLMarketplace.SignedCall[](0);
        vm.prank(publisher);
        market.redeemCalls(calls);
        // No revert, no state change
        assertEq(token.balanceOf(publisher), 0);
    }

    /// @dev redeemCalls with single element works like redeemCall
    function testBatchRedeemSingleElement() public {
        ARTICLMarketplace.SignedCall[] memory calls = new ARTICLMarketplace.SignedCall[](1);
        calls[0] =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 10_000_000, nonce: 20, signature: ""});
        calls[0].signature = _sign(calls[0], buyerKey);

        vm.prank(publisher);
        market.redeemCalls(calls);

        assertEq(token.balanceOf(buyer), 90_000_000);
        assertEq(token.balanceOf(publisher), 10_000_000);
        assertTrue(market.usedNonces(buyer, 20));
    }

    /// @dev Batch with multiple APIs from different publishers
    function testBatchRedeemMultiplePublishers() public {
        // Register second API with publisher2
        vm.prank(publisher2);
        uint256 apiId2 = market.registerApi("Maps", "ipfs://maps", 50);

        ARTICLMarketplace.SignedCall[] memory calls = new ARTICLMarketplace.SignedCall[](2);
        calls[0] =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 10_000_000, nonce: 30, signature: ""});
        calls[1] =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId2, amount: 5_000_000, nonce: 31, signature: ""});
        calls[0].signature = _sign(calls[0], buyerKey);
        calls[1].signature = _sign(calls[1], buyerKey);

        vm.prank(publisher);
        market.redeemCalls(calls);

        assertEq(token.balanceOf(publisher), 10_000_000);
        assertEq(token.balanceOf(publisher2), 5_000_000);
        assertEq(token.balanceOf(buyer), 85_000_000);
    }

    // ============ Edge Case: Signatures ============

    /// @dev Signature with wrong private key (not the buyer) reverts
    function testRedeemCallWrongSignerReverts() public {
        ARTICLMarketplace.SignedCall memory c =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 1000, nonce: 40, signature: ""});
        // Sign with publisher key instead of buyer key
        c.signature = _sign(c, publisherKey);

        vm.prank(publisher);
        vm.expectRevert(ARTICLMarketplace.InvalidSignature.selector);
        market.redeemCall(c);
    }

    /// @dev Signature with invalid length reverts
    function testRedeemCallInvalidSigLengthReverts() public {
        ARTICLMarketplace.SignedCall memory c =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 1000, nonce: 41, signature: hex"DEADBEEF"});

        vm.prank(publisher);
        vm.expectRevert(ARTICLMarketplace.InvalidSignature.selector);
        market.redeemCall(c);
    }

    /// @dev Fuzz: random nonce values work
    function testFuzz_RandomNonces(uint256 nonce) public {
        ARTICLMarketplace.SignedCall memory c =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 1000, nonce: nonce, signature: ""});
        c.signature = _sign(c, buyerKey);

        vm.prank(publisher);
        market.redeemCall(c);

        assertTrue(market.usedNonces(buyer, nonce));
        assertEq(token.balanceOf(publisher), 1000);
    }

    // ============ Edge Case: registerApi ============

    /// @dev Multiple APIs can be registered, IDs increment
    function testRegisterMultipleApis() public {
        vm.startPrank(publisher);
        uint256 id1 = market.registerApi("API1", "uri1", 100);
        uint256 id2 = market.registerApi("API2", "uri2", 200);
        vm.stopPrank();

        assertEq(id2, id1 + 1);

        (, , , uint256 price1, ) = market.apis(id1);
        (, , , uint256 price2, ) = market.apis(id2);
        assertEq(price1, 100);
        assertEq(price2, 200);
    }

    // ============ Gas Comparison ============

    /// @dev Gas snapshot: single redeemCall
    function testGas_SingleRedeem() public {
        ARTICLMarketplace.SignedCall memory c =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 1000, nonce: 50, signature: ""});
        c.signature = _sign(c, buyerKey);

        vm.prank(publisher);
        uint256 gasBefore = gasleft();
        market.redeemCall(c);
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("Gas: single redeemCall", gasUsed);
    }

    /// @dev Gas snapshot: batch redeemCalls with 2 calls
    function testGas_BatchRedeem2() public {
        ARTICLMarketplace.SignedCall[] memory calls = new ARTICLMarketplace.SignedCall[](2);
        calls[0] =
            ARTICLMarketplace.SignedCall({buyer: buyer, apiId: apiId, amount: 1000, nonce: 51, signature: ""});
        calls[1] =
            ARTICLMarketplace.SignedCall({buyer: buyer2, apiId: apiId, amount: 1000, nonce: 52, signature: ""});
        calls[0].signature = _sign(calls[0], buyerKey);
        calls[1].signature = _sign(calls[1], buyer2Key);

        vm.prank(publisher);
        uint256 gasBefore = gasleft();
        market.redeemCalls(calls);
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("Gas: batch redeemCalls (2)", gasUsed);
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

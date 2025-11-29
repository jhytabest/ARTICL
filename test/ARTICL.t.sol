// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {ARTICL} from "../src/ARTICL.sol";

contract ARTICLTest is Test {
    ARTICL public mtap;

    address publisher = address(0x1);
    address client = address(0x2);
    address anotherClient = address(0x3);

    string constant DOMAIN = "api.example.com";
    uint256 constant PRICE_PER_CALL = 0.001 ether;

    // Test secrets and their hashes
    string constant SECRET_1 = "my-secret-key-123";
    string constant SECRET_2 = "another-secret-456";

    bytes32 ticketHash1;
    bytes32 ticketHash2;

    function setUp() public {
        mtap = new ARTICL();

        // Generate ticket hashes
        ticketHash1 = keccak256(abi.encodePacked(SECRET_1));
        ticketHash2 = keccak256(abi.encodePacked(SECRET_2));

        // Give test accounts some ETH
        vm.deal(publisher, 10 ether);
        vm.deal(client, 10 ether);
        vm.deal(anotherClient, 10 ether);
    }

    // ============ Publisher Registration Tests ============

    function test_PublisherRegistration() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        (string memory domain, uint256 price, address payout) = mtap.getPublisher(publisher);

        assertEq(domain, DOMAIN);
        assertEq(price, PRICE_PER_CALL);
        assertEq(payout, publisher);
    }

    function test_PublisherRegistrationEmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit ARTICL.PublisherRegistered(
            publisher,
            DOMAIN,
            PRICE_PER_CALL,
            publisher
        );

        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);
    }

    function test_RevertWhen_PublisherAlreadyRegistered() public {
        vm.startPrank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.expectRevert(ARTICL.PublisherAlreadyRegistered.selector);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);
        vm.stopPrank();
    }

    function test_RevertWhen_RegisterWithZeroPrice() public {
        vm.prank(publisher);
        vm.expectRevert(ARTICL.InvalidPrice.selector);
        mtap.registerPublisher(DOMAIN, 0, publisher);
    }

    // ============ Publisher Price Update Tests ============

    function test_UpdatePrice() public {
        vm.startPrank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        uint256 newPrice = 0.002 ether;
        mtap.updatePrice(newPrice);

        (, uint256 price, ) = mtap.getPublisher(publisher);
        assertEq(price, newPrice);
        vm.stopPrank();
    }

    function test_RevertWhen_UpdatePriceNotRegistered() public {
        vm.prank(publisher);
        vm.expectRevert(ARTICL.PublisherNotRegistered.selector);
        mtap.updatePrice(PRICE_PER_CALL);
    }

    function test_RevertWhen_UpdatePriceToZero() public {
        vm.startPrank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.expectRevert(ARTICL.InvalidPrice.selector);
        mtap.updatePrice(0);
        vm.stopPrank();
    }

    // ============ Client Deposit Tests ============

    function test_ClientDeposit() public {
        uint256 depositAmount = 1 ether;

        vm.prank(client);
        mtap.deposit{value: depositAmount}();

        assertEq(mtap.clientBalances(client), depositAmount);
    }

    function test_ClientDepositEmitsEvent() public {
        uint256 depositAmount = 1 ether;

        vm.expectEmit(true, true, true, true);
        emit ARTICL.Deposit(client, depositAmount);

        vm.prank(client);
        mtap.deposit{value: depositAmount}();
    }

    function test_MultipleDeposits() public {
        vm.startPrank(client);
        mtap.deposit{value: 1 ether}();
        mtap.deposit{value: 0.5 ether}();
        vm.stopPrank();

        assertEq(mtap.clientBalances(client), 1.5 ether);
    }

    // ============ Ticket Purchase Tests ============

    function test_BuyTicket() public {
        // Setup: Register publisher
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        // Client deposits funds
        vm.prank(client);
        mtap.deposit{value: 1 ether}();

        // Client buys ticket
        vm.prank(client);
        mtap.buyTicket(publisher, ticketHash1);

        // Verify balances
        assertEq(mtap.clientBalances(client), 1 ether - PRICE_PER_CALL);
        assertEq(mtap.publisherBalances(publisher), PRICE_PER_CALL);

        // Verify ticket
        assertTrue(mtap.verifyTicket(publisher, ticketHash1));
    }

    function test_BuyTicketEmitsEvent() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(client);
        mtap.deposit{value: 1 ether}();

        vm.expectEmit(true, true, true, true);
        emit ARTICL.TicketPurchased(
            client,
            publisher,
            ticketHash1,
            PRICE_PER_CALL
        );

        vm.prank(client);
        mtap.buyTicket(publisher, ticketHash1);
    }

    function test_RevertWhen_BuyTicketInsufficientBalance() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(client);
        mtap.deposit{value: 0.0001 ether}(); // Not enough

        vm.prank(client);
        vm.expectRevert(ARTICL.InsufficientBalance.selector);
        mtap.buyTicket(publisher, ticketHash1);
    }

    function test_RevertWhen_BuyTicketPublisherNotRegistered() public {
        vm.prank(client);
        mtap.deposit{value: 1 ether}();

        vm.prank(client);
        vm.expectRevert(ARTICL.PublisherNotRegistered.selector);
        mtap.buyTicket(publisher, ticketHash1);
    }

    function test_RevertWhen_BuyTicketAlreadyPurchased() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(client);
        mtap.deposit{value: 1 ether}();

        vm.startPrank(client);
        mtap.buyTicket(publisher, ticketHash1);

        vm.expectRevert(ARTICL.TicketAlreadyPurchased.selector);
        mtap.buyTicket(publisher, ticketHash1);
        vm.stopPrank();
    }

    // ============ Batch Ticket Purchase Tests ============

    function test_BuyTickets() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(client);
        mtap.deposit{value: 1 ether}();

        bytes32[] memory hashes = new bytes32[](2);
        hashes[0] = ticketHash1;
        hashes[1] = ticketHash2;

        vm.prank(client);
        mtap.buyTickets(publisher, hashes);

        // Verify both tickets
        assertTrue(mtap.verifyTicket(publisher, ticketHash1));
        assertTrue(mtap.verifyTicket(publisher, ticketHash2));

        // Verify balances
        assertEq(mtap.clientBalances(client), 1 ether - (PRICE_PER_CALL * 2));
        assertEq(mtap.publisherBalances(publisher), PRICE_PER_CALL * 2);
    }

    function test_RevertWhen_BuyTicketsInsufficientBalance() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(client);
        mtap.deposit{value: PRICE_PER_CALL}(); // Only enough for 1 ticket

        bytes32[] memory hashes = new bytes32[](2);
        hashes[0] = ticketHash1;
        hashes[1] = ticketHash2;

        vm.prank(client);
        vm.expectRevert(ARTICL.InsufficientBalance.selector);
        mtap.buyTickets(publisher, hashes);
    }

    // ============ Ticket Verification Tests ============

    function test_VerifyTicket() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(client);
        mtap.deposit{value: 1 ether}();

        vm.prank(client);
        mtap.buyTicket(publisher, ticketHash1);

        assertTrue(mtap.verifyTicket(publisher, ticketHash1));
    }

    function test_VerifyTicketReturnsFalseForNonExistent() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        assertFalse(mtap.verifyTicket(publisher, ticketHash1));
    }

    function test_VerifyTicketReturnsFalseAfterConsumption() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(client);
        mtap.deposit{value: 1 ether}();

        vm.prank(client);
        mtap.buyTicket(publisher, ticketHash1);

        vm.prank(publisher);
        mtap.consumeTicket(ticketHash1);

        assertFalse(mtap.verifyTicket(publisher, ticketHash1));
    }

    // ============ Ticket Consumption Tests ============

    function test_ConsumeTicket() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(client);
        mtap.deposit{value: 1 ether}();

        vm.prank(client);
        mtap.buyTicket(publisher, ticketHash1);

        vm.prank(publisher);
        mtap.consumeTicket(ticketHash1);

        (,, bool isConsumed, ) = mtap.getTicket(ticketHash1);
        assertTrue(isConsumed);
    }

    function test_ConsumeTicketEmitsEvent() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(client);
        mtap.deposit{value: 1 ether}();

        vm.prank(client);
        mtap.buyTicket(publisher, ticketHash1);

        vm.expectEmit(true, true, true, true);
        emit ARTICL.TicketConsumed(publisher, ticketHash1);

        vm.prank(publisher);
        mtap.consumeTicket(ticketHash1);
    }

    function test_RevertWhen_ConsumeTicketNotFound() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(publisher);
        vm.expectRevert(ARTICL.TicketNotFound.selector);
        mtap.consumeTicket(ticketHash1);
    }

    function test_RevertWhen_ConsumeTicketAlreadyConsumed() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(client);
        mtap.deposit{value: 1 ether}();

        vm.prank(client);
        mtap.buyTicket(publisher, ticketHash1);

        vm.startPrank(publisher);
        mtap.consumeTicket(ticketHash1);

        vm.expectRevert(ARTICL.TicketAlreadyConsumed.selector);
        mtap.consumeTicket(ticketHash1);
        vm.stopPrank();
    }

    // ============ Publisher Withdrawal Tests ============

    function test_Withdraw() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(client);
        mtap.deposit{value: 1 ether}();

        vm.prank(client);
        mtap.buyTicket(publisher, ticketHash1);

        uint256 balanceBefore = publisher.balance;

        vm.prank(publisher);
        mtap.withdraw();

        assertEq(publisher.balance, balanceBefore + PRICE_PER_CALL);
        assertEq(mtap.publisherBalances(publisher), 0);
    }

    function test_WithdrawEmitsEvent() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(client);
        mtap.deposit{value: 1 ether}();

        vm.prank(client);
        mtap.buyTicket(publisher, ticketHash1);

        vm.expectEmit(true, true, true, true);
        emit ARTICL.Withdrawal(publisher, PRICE_PER_CALL);

        vm.prank(publisher);
        mtap.withdraw();
    }

    function test_RevertWhen_WithdrawNoBalance() public {
        vm.prank(publisher);
        vm.expectRevert(ARTICL.NoBalanceToWithdraw.selector);
        mtap.withdraw();
    }

    function test_MultipleClientsMultipleTickets() public {
        // Register publisher
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        // Client 1 buys ticket
        vm.prank(client);
        mtap.deposit{value: 1 ether}();
        vm.prank(client);
        mtap.buyTicket(publisher, ticketHash1);

        // Client 2 buys ticket
        vm.prank(anotherClient);
        mtap.deposit{value: 1 ether}();
        vm.prank(anotherClient);
        mtap.buyTicket(publisher, ticketHash2);

        // Publisher should have revenue from both
        assertEq(mtap.publisherBalances(publisher), PRICE_PER_CALL * 2);

        // Both tickets should be valid
        assertTrue(mtap.verifyTicket(publisher, ticketHash1));
        assertTrue(mtap.verifyTicket(publisher, ticketHash2));
    }

    // ============ Getter Function Tests ============

    function test_GetPublisher() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        (string memory domain, uint256 price, address payout) = mtap.getPublisher(publisher);

        assertEq(domain, DOMAIN);
        assertEq(price, PRICE_PER_CALL);
        assertEq(payout, publisher);
    }

    function test_RevertWhen_GetPublisherNotRegistered() public {
        vm.expectRevert(ARTICL.PublisherNotRegistered.selector);
        mtap.getPublisher(publisher);
    }

    function test_GetTicket() public {
        vm.prank(publisher);
        mtap.registerPublisher(DOMAIN, PRICE_PER_CALL, publisher);

        vm.prank(client);
        mtap.deposit{value: 1 ether}();

        vm.prank(client);
        mtap.buyTicket(publisher, ticketHash1);

        (address ticketClient, address ticketPublisher, bool isConsumed, uint256 purchasedAt) =
            mtap.getTicket(ticketHash1);

        assertEq(ticketClient, client);
        assertEq(ticketPublisher, publisher);
        assertFalse(isConsumed);
        assertGt(purchasedAt, 0);
    }

    function test_RevertWhen_GetTicketNotFound() public {
        vm.expectRevert(ARTICL.TicketNotFound.selector);
        mtap.getTicket(ticketHash1);
    }
}

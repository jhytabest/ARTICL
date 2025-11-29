// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ARTICL - API Resource Ticket Incentive & Compensation Ledger
 * @author jhytabest
 * @notice A decentralized protocol for pay-per-call API access
 * @dev Uses hash-based tickets for trustless off-chain verification
 */
contract ARTICL {
    // ============ Errors ============

    error PublisherAlreadyRegistered();
    error PublisherNotRegistered();
    error InsufficientBalance();
    error TicketAlreadyPurchased();
    error TicketNotFound();
    error TicketAlreadyConsumed();
    error InvalidPrice();
    error NoBalanceToWithdraw();
    error WithdrawalFailed();

    // ============ Events ============

    event PublisherRegistered(
        address indexed publisher,
        string domain,
        uint256 pricePerCall,
        address payoutWallet
    );

    event PublisherUpdated(
        address indexed publisher,
        uint256 newPricePerCall
    );

    event Deposit(
        address indexed client,
        uint256 amount
    );

    event TicketPurchased(
        address indexed client,
        address indexed publisher,
        bytes32 indexed ticketHash,
        uint256 price
    );

    event TicketConsumed(
        address indexed publisher,
        bytes32 indexed ticketHash
    );

    event Withdrawal(
        address indexed publisher,
        uint256 amount
    );

    // ============ Structs ============

    struct Publisher {
        string domain;              // Publisher's domain (e.g., "api.example.com")
        uint256 pricePerCall;       // Price per API call in wei
        address payoutWallet;       // Where publisher receives payments
        bool isRegistered;          // Registration status
    }

    struct Ticket {
        address client;             // Who purchased the ticket
        address publisher;          // Which publisher this ticket is for
        bool isConsumed;            // Whether ticket has been used
        uint256 purchasedAt;        // Timestamp of purchase
    }

    // ============ State Variables ============

    // Publisher data: publisher address => Publisher struct
    mapping(address => Publisher) public publishers;

    // Client prepaid balances: client address => balance in wei
    mapping(address => uint256) public clientBalances;

    // Publisher revenue balances: publisher address => balance in wei
    mapping(address => uint256) public publisherBalances;

    // Tickets: ticketHash => Ticket struct
    mapping(bytes32 => Ticket) public tickets;

    // Quick lookup: publisher => ticketHash => client address (0x0 if not purchased)
    mapping(address => mapping(bytes32 => address)) public publisherTickets;

    // ============ Publisher Functions ============

    /**
     * @notice Register as a publisher
     * @param domain Your API domain (e.g., "api.example.com")
     * @param pricePerCall Price in wei for each API call
     * @param payoutWallet Address where you want to receive payments
     */
    function registerPublisher(
        string calldata domain,
        uint256 pricePerCall,
        address payoutWallet
    ) external {
        if (publishers[msg.sender].isRegistered) {
            revert PublisherAlreadyRegistered();
        }
        if (pricePerCall == 0) {
            revert InvalidPrice();
        }

        publishers[msg.sender] = Publisher({
            domain: domain,
            pricePerCall: pricePerCall,
            payoutWallet: payoutWallet,
            isRegistered: true
        });

        emit PublisherRegistered(msg.sender, domain, pricePerCall, payoutWallet);
    }

    /**
     * @notice Update your price per call
     * @param newPricePerCall New price in wei
     */
    function updatePrice(uint256 newPricePerCall) external {
        if (!publishers[msg.sender].isRegistered) {
            revert PublisherNotRegistered();
        }
        if (newPricePerCall == 0) {
            revert InvalidPrice();
        }

        publishers[msg.sender].pricePerCall = newPricePerCall;
        emit PublisherUpdated(msg.sender, newPricePerCall);
    }

    /**
     * @notice Withdraw your accumulated revenue
     */
    function withdraw() external {
        uint256 balance = publisherBalances[msg.sender];
        if (balance == 0) {
            revert NoBalanceToWithdraw();
        }

        publisherBalances[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: balance}("");
        if (!success) {
            publisherBalances[msg.sender] = balance; // Restore balance on failure
            revert WithdrawalFailed();
        }

        emit Withdrawal(msg.sender, balance);
    }

    /**
     * @notice Mark a ticket as consumed (used)
     * @param ticketHash The hash of the secret that was used
     */
    function consumeTicket(bytes32 ticketHash) external {
        if (publisherTickets[msg.sender][ticketHash] == address(0)) {
            revert TicketNotFound();
        }
        if (tickets[ticketHash].isConsumed) {
            revert TicketAlreadyConsumed();
        }

        tickets[ticketHash].isConsumed = true;
        emit TicketConsumed(msg.sender, ticketHash);
    }

    // ============ Client Functions ============

    /**
     * @notice Deposit funds to your prepaid balance
     */
    function deposit() external payable {
        clientBalances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @notice Purchase a ticket for a publisher's API
     * @param publisher The publisher's address
     * @param ticketHash The hash of your secret (keccak256(secret))
     */
    function buyTicket(address publisher, bytes32 ticketHash) external {
        Publisher memory pub = publishers[publisher];

        if (!pub.isRegistered) {
            revert PublisherNotRegistered();
        }
        if (publisherTickets[publisher][ticketHash] != address(0)) {
            revert TicketAlreadyPurchased();
        }
        if (clientBalances[msg.sender] < pub.pricePerCall) {
            revert InsufficientBalance();
        }

        // Deduct from client balance
        clientBalances[msg.sender] -= pub.pricePerCall;

        // Add to publisher balance
        publisherBalances[publisher] += pub.pricePerCall;

        // Store ticket
        tickets[ticketHash] = Ticket({
            client: msg.sender,
            publisher: publisher,
            isConsumed: false,
            purchasedAt: block.timestamp
        });

        publisherTickets[publisher][ticketHash] = msg.sender;

        emit TicketPurchased(msg.sender, publisher, ticketHash, pub.pricePerCall);
    }

    /**
     * @notice Purchase multiple tickets at once (batch operation)
     * @param publisher The publisher's address
     * @param ticketHashes Array of ticket hashes
     */
    function buyTickets(address publisher, bytes32[] calldata ticketHashes) external {
        Publisher memory pub = publishers[publisher];

        if (!pub.isRegistered) {
            revert PublisherNotRegistered();
        }

        uint256 totalCost = pub.pricePerCall * ticketHashes.length;
        if (clientBalances[msg.sender] < totalCost) {
            revert InsufficientBalance();
        }

        // Deduct total from client balance
        clientBalances[msg.sender] -= totalCost;

        // Add to publisher balance
        publisherBalances[publisher] += totalCost;

        // Store all tickets
        for (uint256 i = 0; i < ticketHashes.length; i++) {
            bytes32 ticketHash = ticketHashes[i];

            if (publisherTickets[publisher][ticketHash] != address(0)) {
                revert TicketAlreadyPurchased();
            }

            tickets[ticketHash] = Ticket({
                client: msg.sender,
                publisher: publisher,
                isConsumed: false,
                purchasedAt: block.timestamp
            });

            publisherTickets[publisher][ticketHash] = msg.sender;

            emit TicketPurchased(msg.sender, publisher, ticketHash, pub.pricePerCall);
        }
    }

    // ============ View Functions ============

    /**
     * @notice Verify if a ticket hash is valid and paid for
     * @param publisher The publisher address
     * @param ticketHash The hash to verify
     * @return isValid Whether the ticket is valid and not consumed
     */
    function verifyTicket(address publisher, bytes32 ticketHash)
        external
        view
        returns (bool isValid)
    {
        address client = publisherTickets[publisher][ticketHash];
        if (client == address(0)) {
            return false;
        }
        return !tickets[ticketHash].isConsumed;
    }

    /**
     * @notice Get publisher information
     * @param publisher The publisher address
     * @return domain Publisher's domain
     * @return pricePerCall Price per API call
     * @return payoutWallet Payout wallet address
     */
    function getPublisher(address publisher)
        external
        view
        returns (
            string memory domain,
            uint256 pricePerCall,
            address payoutWallet
        )
    {
        Publisher memory pub = publishers[publisher];
        if (!pub.isRegistered) {
            revert PublisherNotRegistered();
        }
        return (pub.domain, pub.pricePerCall, pub.payoutWallet);
    }

    /**
     * @notice Get ticket information
     * @param ticketHash The ticket hash
     * @return client Who purchased the ticket
     * @return publisher Which publisher the ticket is for
     * @return isConsumed Whether the ticket has been used
     * @return purchasedAt Timestamp of purchase
     */
    function getTicket(bytes32 ticketHash)
        external
        view
        returns (
            address client,
            address publisher,
            bool isConsumed,
            uint256 purchasedAt
        )
    {
        Ticket memory ticket = tickets[ticketHash];
        if (ticket.client == address(0)) {
            revert TicketNotFound();
        }
        return (ticket.client, ticket.publisher, ticket.isConsumed, ticket.purchasedAt);
    }
}

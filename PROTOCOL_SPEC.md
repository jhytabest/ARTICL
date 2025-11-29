# ARTICL Protocol Specification v1.0

## Abstract

ARTICL - API Resource Ticket Incentive & Compensation Ledger (ARTICL) is a decentralized, trustless protocol for pay-per-call API access control. It uses blockchain-based smart contracts for payment settlement and cryptographic hash verification for access control, enabling publishers to monetize APIs without intermediaries while guaranteeing payment for every valid request.

## Motivation

Traditional API monetization models have several problems:

1. **Subscription fatigue**: Users pay for access they don't use
2. **Trust requirements**: Centralized payment processors
3. **High overhead**: Complex billing systems
4. **Vendor lock-in**: Proprietary solutions

ARTICL solves these by providing:
- Pay-per-use model with guaranteed payments
- Trustless verification via smart contracts
- Open protocol anyone can implement
- No central authority or intermediary

## System Architecture

### Components

1. **Smart Contract** (on-chain)
   - Stores publisher registrations
   - Manages client prepaid balances
   - Records ticket purchases
   - Handles payment settlement

2. **Client** (off-chain)
   - Generates secrets locally
   - Purchases tickets via smart contract
   - Uses secrets as API keys

3. **Publisher** (off-chain)
   - Runs API server
   - Verifies tickets by hashing secrets
   - Optionally marks tickets as consumed

### Data Flow

```
1. Publisher Registration (on-chain):
   Publisher → Smart Contract: registerPublisher(domain, price, wallet)
   Smart Contract → Storage: Store publisher data

2. Client Preparation (hybrid):
   Client (local): Generate secret, compute hash = keccak256(secret)
   Client → Smart Contract: deposit(amount)
   Client → Smart Contract: buyTicket(publisher, hash)
   Smart Contract → Publisher Balance: Transfer payment
   Smart Contract → Storage: Store ticket mapping (hash → client)

3. API Access (off-chain → on-chain verification):
   Client → Publisher API: HTTP request + X-ARTICL-Access-Key: <secret>
   Publisher (local): Compute hash = keccak256(secret)
   Publisher → Smart Contract: verifyTicket(publisher, hash) [read-only]
   Smart Contract → Publisher: Return boolean (valid/invalid)
   Publisher → Client: API response (if valid)

4. Ticket Consumption (optional, on-chain):
   Publisher → Smart Contract: consumeTicket(hash)
   Smart Contract → Storage: Mark ticket as consumed
```

## Core Concepts

### 1. Secret-Hash System

**Secret Generation**:
```javascript
// Client generates random secret (32 bytes)
secret = randomBytes(32)
// e.g., "0x7a8f9c3e2d1b4a5f6c8e9d0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c"
```

**Hash Computation**:
```javascript
// Client computes hash
hash = keccak256(secret)
// e.g., "0x3f4b2c1d..."
```

**Why This Works**:
- Secret is known only to client (pre-image)
- Hash is public and stored on-chain
- Hash → Secret is computationally infeasible (one-way function)
- Secret → Hash is trivial (verification)
- Publisher can verify: keccak256(received_secret) == stored_hash

### 2. Ticket Lifecycle

```
┌─────────────┐
│  GENERATED  │ Client generates secret locally
└──────┬──────┘
       │
       │ buyTicket(hash)
       ▼
┌─────────────┐
│  PURCHASED  │ Hash stored on-chain, payment transferred
└──────┬──────┘
       │
       │ API call with secret
       ▼
┌─────────────┐
│   VERIFIED  │ Publisher verifies hash matches
└──────┬──────┘
       │
       │ consumeTicket(hash) [optional]
       ▼
┌─────────────┐
│  CONSUMED   │ Ticket marked as used (cannot be reused)
└─────────────┘
```

### 3. Payment Model

**Prepaid Balance System**:
- Clients deposit funds into smart contract
- Funds held in client's balance
- Ticket purchases deduct from balance
- Atomic transfer to publisher on purchase

**Revenue Distribution**:
- Instant settlement: payment on ticket purchase
- Publisher balance accumulated on-chain
- Withdrawal anytime via `withdraw()`

## Smart Contract Interface

### Data Structures

```solidity
struct Publisher {
    string domain;          // API domain (e.g., "api.example.com")
    uint256 pricePerCall;   // Price in wei
    address payoutWallet;   // Where to receive payments
    bool isRegistered;      // Registration status
}

struct Ticket {
    address client;         // Purchaser
    address publisher;      // Target publisher
    bool isConsumed;        // Usage status
    uint256 purchasedAt;    // Timestamp
}
```

### State Variables

```solidity
mapping(address => Publisher) public publishers;
mapping(address => uint256) public clientBalances;
mapping(address => uint256) public publisherBalances;
mapping(bytes32 => Ticket) public tickets;
mapping(address => mapping(bytes32 => address)) public publisherTickets;
```

### Functions

#### Publisher Functions

```solidity
function registerPublisher(
    string calldata domain,
    uint256 pricePerCall,
    address payoutWallet
) external

function updatePrice(uint256 newPricePerCall) external

function withdraw() external

function consumeTicket(bytes32 ticketHash) external
```

#### Client Functions

```solidity
function deposit() external payable

function buyTicket(
    address publisher,
    bytes32 ticketHash
) external

function buyTickets(
    address publisher,
    bytes32[] calldata ticketHashes
) external
```

#### View Functions

```solidity
function verifyTicket(
    address publisher,
    bytes32 ticketHash
) external view returns (bool)

function getPublisher(address publisher)
    external view returns (string, uint256, address)

function getTicket(bytes32 ticketHash)
    external view returns (address, address, bool, uint256)
```

### Events

```solidity
event PublisherRegistered(
    address indexed publisher,
    string domain,
    uint256 pricePerCall,
    address payoutWallet
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
```

## HTTP API Convention

### Request Format

Clients include their secret in a custom header:

```http
GET /api/resource HTTP/1.1
Host: api.example.com
X-ARTICL-Access-Key: <secret>
```

**Header Name**: `X-ARTICL-Access-Key` (customizable)
**Value**: The secret string (not the hash)

### Response Codes

```
200 OK              - Valid ticket, request processed
401 Unauthorized    - Missing X-ARTICL-Access-Key header
403 Forbidden       - Invalid or consumed ticket
500 Internal Error  - Verification failed
```

### Example Response (Invalid Ticket)

```json
{
  "error": "Invalid or consumed ticket",
  "message": "This access key is not valid or has already been used"
}
```

## Security Considerations

### Attack Vectors & Mitigations

**1. Replay Attacks**
- **Risk**: Reusing the same secret multiple times
- **Mitigation**: Optional ticket consumption via `consumeTicket()`
- **Trade-off**: Costs gas, but prevents reuse

**2. Front-Running**
- **Risk**: Attacker sees hash in mempool and uses it first
- **Mitigation**: Hash reveals no information about secret
- **Note**: Even if attacker buys same hash, they don't have the secret

**3. Reentrancy**
- **Risk**: Malicious contract calls back during withdrawal
- **Mitigation**: Checks-Effects-Interactions pattern used
- **Implementation**: Balance set to 0 before transfer

**4. Gas Optimization Attacks**
- **Risk**: Excessive gas costs for verification
- **Mitigation**: View functions (read-only) have no gas cost
- **Best Practice**: Cache verified tickets off-chain

### Best Practices

**For Clients**:
1. Generate secrets with cryptographically secure randomness
2. Store secrets securely (encrypted, environment variables)
3. Never reuse secrets across different publishers
4. Verify publisher pricing before purchase

**For Publishers**:
1. Always verify tickets on-chain or from cache
2. Implement rate limiting alongside ARTICL
3. Use caching for high-traffic APIs
4. Monitor for unusual patterns
5. Consider batch ticket consumption to save gas

**For Developers**:
1. Audit smart contract code
2. Test thoroughly on testnets
3. Use established client libraries
4. Implement proper error handling

## Performance Considerations

### Gas Costs

| Operation | Approximate Gas | Cost @ 50 gwei |
|-----------|----------------|----------------|
| Register Publisher | 100,000 | $0.50 |
| Deposit | 50,000 | $0.25 |
| Buy Ticket (single) | 90,000 | $0.45 |
| Buy Tickets (batch 10) | 500,000 | $2.50 |
| Verify Ticket | 0 (view) | $0.00 |
| Consume Ticket | 30,000 | $0.15 |
| Withdraw | 35,000 | $0.175 |

*Costs calculated at $1000/ETH and 50 gwei gas price*

### Optimization Strategies

**1. Batch Operations**
```javascript
// Instead of 10 separate transactions (10x gas)
for (let i = 0; i < 10; i++) {
  await articl.buyTicket(publisher, hashes[i]);
}

// Use batch operation (1 transaction)
await articl.buyTickets(publisher, hashes);
```

**2. Caching**
```javascript
// Cache verified tickets for 1 hour
const cache = new Map();

function isTicketValid(hash) {
  if (cache.has(hash)) {
    const { valid, timestamp } = cache.get(hash);
    if (Date.now() - timestamp < 3600000) {
      return valid;
    }
  }

  const valid = await verifyTicketOnChain(hash);
  cache.set(hash, { valid, timestamp: Date.now() });
  return valid;
}
```

**3. Layer 2 Deployment**
Deploy on L2s for 100-1000x lower gas costs:
- Polygon: ~0.001 MATIC per transaction
- Arbitrum: ~0.0001 ETH per transaction
- Base: ~0.0001 ETH per transaction

## Integration Guide

### Client Integration (3 steps)

```javascript
// 1. Setup
const articl = new ARTICLClient({
  contractAddress: '0x...',
  provider,
  signer
});

// 2. Buy tickets
await articl.deposit(ethers.parseEther('1.0'));
const secrets = await articl.buyTicketsAndGetSecrets(publisherAddr, 10);

// 3. Use tickets
fetch('https://api.example.com/data', {
  headers: { 'X-ARTICL-Access-Key': secrets[0] }
});
```

### Publisher Integration (Express.js)

```javascript
// 1. Register (once)
await articl.registerPublisher(
  'api.example.com',
  ethers.parseEther('0.001'),
  walletAddress
);

// 2. Add middleware
const articlAuth = createARTICLMiddleware({
  contractAddress: '0x...',
  provider,
  publisherAddress: walletAddress,
  cache: true
});

// 3. Protect routes
app.get('/api/premium', articlAuth, (req, res) => {
  res.json({ data: 'Premium content' });
});
```

## Future Extensions

### Potential Enhancements

1. **Subscription Tickets**
   - Time-based access instead of single-use
   - Expiration timestamps

2. **Refundable Tickets**
   - Unused tickets can be refunded
   - Partial refund mechanism

3. **Multi-Publisher Tickets**
   - One ticket works for multiple publishers
   - Consortium pricing

4. **Dynamic Pricing**
   - On-chain oracle integration
   - Demand-based pricing

5. **Ticket Resale Market**
   - Transfer tickets between users
   - Secondary market for API access

## Comparison to Alternatives

| Feature | ARTICL | Stripe | AWS Marketplace | OAuth + Billing |
|---------|------|--------|-----------------|-----------------|
| Decentralized | ✅ | ❌ | ❌ | ❌ |
| Pay-per-call | ✅ | ❌ | ⚠️ | ⚠️ |
| No intermediary | ✅ | ❌ | ❌ | ❌ |
| Instant settlement | ✅ | ❌ | ❌ | ❌ |
| Global by default | ✅ | ⚠️ | ⚠️ | ⚠️ |
| No KYC required | ✅ | ❌ | ❌ | ⚠️ |
| Setup complexity | Medium | Low | Medium | High |
| Transaction cost | Gas fees | 2.9% + $0.30 | 30% | Varies |

## Reference Implementation

This specification is implemented in:
- Smart Contract: `src/ARTICL.sol`
- Client Library: `client-sdk/src/ARTICLClient.ts`
- Publisher Middleware: `examples/publisher-middleware.ts`

## Versioning

This is ARTICL Protocol Specification v1.0.

Future versions will maintain backward compatibility where possible and clearly document breaking changes.

## License

This specification is released under MIT License.

---

**Specification Author**: jhytabest
**Last Updated**: 2025-11-29
**Status**: Stable

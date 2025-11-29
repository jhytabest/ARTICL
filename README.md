# ARTICL - API Resource Ticket Incentive & Compensation Ledger

> A fully decentralized protocol for pay-per-call API access
>
> **Author**: jhytabest

## What is ARTICL?

ARTICL (ARTICL - API Resource Ticket Incentive & Compensation Ledger) is a trustless, blockchain-based protocol that enables:

- **Publishers** to monetize their APIs with guaranteed payments per call
- **Clients** to pay for API access on a per-use basis without subscriptions
- **Zero trust** - no central authority, no intermediaries
- **Instant payments** - publishers get paid immediately when tickets are purchased
- **Cryptographic security** - tickets are verified using hash-based proofs

## How It Works

```
┌──────────┐                  ┌───────────────┐                  ┌───────────┐
│  Client  │                  │ Smart Contract│                  │ Publisher │
└─────┬────┘                  └───────┬───────┘                  └─────┬─────┘
      │                               │                                │
      │ 1. Deposit funds              │                                │
      ├──────────────────────────────>│                                │
      │                               │                                │
      │ 2. Generate secret locally    │                                │
      │    hash = keccak256(secret)   │                                │
      │                               │                                │
      │ 3. Buy ticket with hash       │                                │
      ├──────────────────────────────>│                                │
      │                               │                                │
      │                               │ 4. Payment sent to publisher   │
      │                               ├───────────────────────────────>│
      │                               │                                │
      │ 5. API call with secret       │                                │
      ├───────────────────────────────────────────────────────────────>│
      │                               │                                │
      │                               │ 6. Verify hash on-chain        │
      │                               │<───────────────────────────────┤
      │                               │                                │
      │                               │ 7. Hash matches = ticket valid │
      │                               ├───────────────────────────────>│
      │                               │                                │
      │ 8. API response               │                                │
      │<───────────────────────────────────────────────────────────────┤
      │                               │                                │
```

### Key Concepts

1. **Secret & Hash**: Clients generate a random secret and compute its hash (keccak256)
2. **Ticket Purchase**: Client buys a ticket by sending the hash to the smart contract
3. **Payment**: Smart contract automatically transfers payment from client to publisher
4. **API Access**: Client uses the secret as an API key
5. **Verification**: Publisher verifies the secret by hashing it and checking on-chain

## Features

- ✅ **Decentralized** - No central server or authority required
- ✅ **Trustless** - Cryptographic verification of payments
- ✅ **Pay-per-call** - No subscriptions, pay only for what you use
- ✅ **Instant payments** - Publishers receive payment immediately
- ✅ **Transparent** - All transactions on-chain
- ✅ **Flexible pricing** - Publishers set their own prices
- ✅ **Batch operations** - Buy multiple tickets at once
- ✅ **Optional caching** - Publishers can cache validations for performance

## Project Structure

```
ARTICL/
├── src/                              # Smart contracts (Solidity)
│   └── ARTICL.sol                    # Core ARTICL contract
├── test/                             # Smart contract tests
│   └── ARTICL.t.sol
├── script/                           # Deployment scripts
├── client-sdk/                       # TypeScript client library
│   ├── src/
│   │   ├── ARTICLClient.ts            # Main client class
│   │   ├── index.ts                 # Public exports
│   │   └── abi.json                 # Contract ABI
│   ├── package.json
│   └── tsconfig.json
├── examples/                         # Usage examples
│   ├── client-example.ts            # Client usage example
│   ├── publisher-middleware.ts      # Express.js middleware
│   └── publisher-server.ts          # Complete server example
├── foundry.toml                     # Foundry configuration
└── README.md                        # This file
```

## Quick Start

### 1. Install Dependencies

```bash
# Install Foundry (if not already installed)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install Node.js dependencies for client SDK
cd client-sdk
npm install
```

### 2. Compile and Test Contracts

```bash
# Compile contracts
forge build

# Run tests
forge test -vv

# Run tests with gas reporting
forge test --gas-report
```

### 3. Deploy Contract

```bash
# Start local blockchain (Anvil)
anvil

# In another terminal, deploy contract
forge create src/ARTICL.sol:ARTICL \
  --rpc-url http://localhost:8545 \
  --private-key YOUR_PRIVATE_KEY
```

### 4. Use as a Client

```typescript
import { ethers } from 'ethers';
import { ARTICLClient } from './client-sdk/src';

// Initialize client
const provider = new ethers.JsonRpcProvider('http://localhost:8545');
const signer = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);

const articl = new ARTICLClient({
  contractAddress: '0x...', // Your deployed contract
  provider,
  signer
});

// Deposit funds
await articl.deposit(ethers.parseEther('1.0'));

// Buy tickets and get secrets
const publisherAddress = '0x...';
const secrets = await articl.buyTicketsAndGetSecrets(publisherAddress, 10);

// Use secret as API key
console.log('Your API keys:', secrets);
```

### 5. Use as a Publisher

```typescript
import express from 'express';
import { createARTICLMiddleware } from './examples/publisher-middleware';

const app = express();

// Register as publisher first (do this once)
await articl.registerPublisher(
  'api.example.com',
  ethers.parseEther('0.001'), // 0.001 ETH per call
  publisherWallet
);

// Add ARTICL middleware to protect routes
const articlAuth = createARTICLMiddleware({
  contractAddress: '0x...',
  provider,
  publisherAddress: await signer.getAddress(),
  cache: true
});

// Protected endpoint
app.get('/api/data', articlAuth, (req, res) => {
  res.json({ data: 'Premium content' });
});

app.listen(3000);
```

## Usage Examples

### For Clients

#### Buy Tickets

```typescript
// Buy 10 tickets
const secrets = await articl.buyTicketsAndGetSecrets(publisherAddress, 10);

// Each secret is a one-time API key
// Store them securely!
```

#### Use API with Ticket

```bash
curl -H "X-ARTICL-Access-Key: YOUR_SECRET" \
     https://api.example.com/api/premium/data
```

#### Check Balance

```typescript
const balance = await articl.getClientBalance();
console.log('Prepaid balance:', ethers.formatEther(balance), 'ETH');
```

### For Publishers

#### Register as Publisher

```typescript
await articl.registerPublisher(
  'api.example.com',           // Your domain
  ethers.parseEther('0.001'),  // Price per call (0.001 ETH)
  publisherWallet              // Where to receive payments
);
```

#### Update Pricing

```typescript
await articl.updatePrice(ethers.parseEther('0.002'));
```

#### Withdraw Revenue

```typescript
const balance = await articl.getPublisherBalance();
console.log('Revenue:', ethers.formatEther(balance), 'ETH');

await articl.withdraw();
```

#### Verify Tickets (in your API)

```typescript
// Option 1: Use middleware (recommended)
app.use('/api/*', articlMiddleware);

// Option 2: Manual verification
app.get('/api/data', async (req, res) => {
  const secret = req.headers['x-microaccess-key'];
  const isValid = await articl.verifyTicketWithSecret(publisherAddress, secret);

  if (!isValid) {
    return res.status(403).json({ error: 'Invalid ticket' });
  }

  res.json({ data: 'Premium content' });
});
```

## API Reference

### ARTICLClient

#### Constructor

```typescript
new ARTICLClient(config: ARTICLConfig)
```

#### Client Methods

- `deposit(amount: bigint)` - Deposit funds to prepaid balance
- `buyTicket(publisher, hash)` - Buy single ticket
- `buyTickets(publisher, hashes)` - Buy multiple tickets
- `buyTicketsAndGetSecrets(publisher, count)` - Buy N tickets and get secrets
- `getClientBalance(address?)` - Get prepaid balance

#### Publisher Methods

- `registerPublisher(domain, price, wallet)` - Register as publisher
- `updatePrice(newPrice)` - Update price per call
- `withdraw()` - Withdraw accumulated revenue
- `consumeTicket(hash)` - Mark ticket as consumed
- `getPublisherBalance(address?)` - Get revenue balance

#### View Methods

- `verifyTicket(publisher, hash)` - Verify ticket by hash
- `verifyTicketWithSecret(publisher, secret)` - Verify using secret
- `getPublisher(address)` - Get publisher information
- `getTicket(hash)` - Get ticket information

#### Utility Methods

- `generateSecret()` - Generate random secret and hash
- `hashSecret(secret)` - Compute hash of a secret

## Smart Contract

### Main Functions

#### For Publishers

```solidity
function registerPublisher(string domain, uint256 pricePerCall, address payoutWallet)
function updatePrice(uint256 newPricePerCall)
function withdraw()
function consumeTicket(bytes32 ticketHash)
```

#### For Clients

```solidity
function deposit() payable
function buyTicket(address publisher, bytes32 ticketHash)
function buyTickets(address publisher, bytes32[] ticketHashes)
```

#### View Functions

```solidity
function verifyTicket(address publisher, bytes32 ticketHash) returns (bool)
function getPublisher(address) returns (string domain, uint256 price, address wallet)
function getTicket(bytes32) returns (address client, address publisher, bool consumed, uint256 timestamp)
```

## Security

### For Clients

- ✅ **Never share your secrets** - They are like cash, once used they're gone
- ✅ **Store secrets securely** - Use environment variables or secure storage
- ✅ **Check prices before buying** - Verify publisher pricing

### For Publishers

- ✅ **Always verify tickets** - Never trust client input
- ✅ **Use caching wisely** - Cache verified tickets for performance, but understand the trade-offs
- ✅ **Monitor for abuse** - Watch for unusual patterns
- ✅ **Consider rate limiting** - Add additional protection layers

### Smart Contract Security

- ✅ **Custom errors** - Gas efficient error handling
- ✅ **Reentrancy protection** - Safe withdrawal pattern
- ✅ **Input validation** - All inputs validated
- ✅ **32 comprehensive tests** - All passing

## Gas Costs

Approximate gas costs (on Ethereum mainnet):

- Register Publisher: ~100,000 gas
- Deposit: ~50,000 gas
- Buy Single Ticket: ~90,000 gas
- Buy 10 Tickets: ~500,000 gas
- Verify Ticket (view): 0 gas (read-only)
- Consume Ticket: ~30,000 gas
- Withdraw: ~35,000 gas

💡 **Tip**: Deploy on L2s (Polygon, Arbitrum, Base) for much lower gas costs!

## Development

### Build

```bash
forge build
```

### Test

```bash
forge test -vv
```

### Gas Report

```bash
forge test --gas-report
```

### Coverage

```bash
forge coverage
```

### Local Node

```bash
anvil
```

## License

MIT License - see LICENSE for details.

---

**Built with ❤️ for the decentralized web**

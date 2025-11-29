# ARTICL Quick Start Guide

Get up and running with ARTICL in 5 minutes!

## Prerequisites

- Node.js 18+ and npm
- Foundry (for smart contract development)
- MetaMask or another Ethereum wallet

## 1. Clone and Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd ARTICL

# Install Foundry (if not installed)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install dependencies for client SDK
cd client-sdk
npm install
cd ..
```

## 2. Run Tests

Verify everything works:

```bash
# Compile contracts
forge build

# Run all tests
forge test -vv

# You should see: "32 tests passed"
```

## 3. Deploy Locally

Terminal 1 - Start local blockchain:
```bash
anvil
```

Terminal 2 - Deploy contract:
```bash
# Copy the default account private key from Anvil output
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Deploy
forge script script/Deploy.s.sol:DeployScript --rpc-url http://localhost:8545 --broadcast

# Note the contract address from output
```

## 4. Try It Out

### As a Publisher

```bash
# Create a test script
cat > test-publisher.js << 'EOF'
import { ethers } from 'ethers';
import { ARTICLClient } from './client-sdk/src/index.js';

const CONTRACT_ADDRESS = 'YOUR_CONTRACT_ADDRESS'; // From deployment
const provider = new ethers.JsonRpcProvider('http://localhost:8545');
const signer = new ethers.Wallet(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  provider
);

const articl = new ARTICLClient({
  contractAddress: CONTRACT_ADDRESS,
  provider,
  signer
});

// Register as publisher
const tx = await articl.registerPublisher(
  'api.example.com',
  ethers.parseEther('0.001'),
  await signer.getAddress()
);
await tx.wait();

console.log('✅ Registered as publisher!');
console.log('Publisher address:', await signer.getAddress());

const pub = await articl.getPublisher(await signer.getAddress());
console.log('Domain:', pub.domain);
console.log('Price:', ethers.formatEther(pub.pricePerCall), 'ETH');
EOF

node test-publisher.js
```

### As a Client

```bash
cat > test-client.js << 'EOF'
import { ethers } from 'ethers';
import { ARTICLClient } from './client-sdk/src/index.js';

const CONTRACT_ADDRESS = 'YOUR_CONTRACT_ADDRESS';
const PUBLISHER_ADDRESS = 'YOUR_PUBLISHER_ADDRESS'; // From above

const provider = new ethers.JsonRpcProvider('http://localhost:8545');
// Use a different account (second account from Anvil)
const signer = new ethers.Wallet(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  provider
);

const articl = new ARTICLClient({
  contractAddress: CONTRACT_ADDRESS,
  provider,
  signer
});

// 1. Deposit funds
console.log('💰 Depositing 1 ETH...');
await (await articl.deposit(ethers.parseEther('1.0'))).wait();

// 2. Buy tickets
console.log('🎫 Buying 5 tickets...');
const secrets = await articl.buyTicketsAndGetSecrets(PUBLISHER_ADDRESS, 5);

console.log('\n✅ Done! Your API keys:');
secrets.forEach((secret, i) => {
  console.log(`  ${i + 1}. ${secret}`);
});

console.log('\nUse them like this:');
console.log(`curl -H "X-ARTICL-Access-Key: ${secrets[0]}" http://localhost:3000/api/data`);
EOF

node test-client.js
```

## 5. Run a Protected API

```bash
# Copy the publisher server example
cp examples/publisher-server.ts server.js

# Edit server.js to add your contract and publisher addresses

# Install Express
npm install express

# Run the server
node server.js
```

## 6. Test the API

```bash
# Public endpoint (no auth)
curl http://localhost:3000/api/public

# Protected endpoint (with ticket)
curl -H "X-ARTICL-Access-Key: YOUR_SECRET_FROM_STEP_4" \
     http://localhost:3000/api/data
```

## Next Steps

- Read the [README.md](README.md) for detailed documentation
- Read the [PROTOCOL_SPEC.md](PROTOCOL_SPEC.md) for technical details
- Deploy to testnet (Sepolia, Goerli, etc.)
- Deploy to mainnet or L2 (Polygon, Arbitrum, Base)
- Build your own API and start earning!

## Troubleshooting

**Tests failing?**
```bash
forge clean
forge build
forge test -vv
```

**Can't connect to Anvil?**
- Make sure Anvil is running in another terminal
- Check it's on port 8545: `curl http://localhost:8545`

**TypeScript errors?**
```bash
cd client-sdk
npm install
npm run build
```

**Need help?**
- Check the examples/ directory for working code
- Read the full README.md
- Open an issue on GitHub

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   ARTICL System                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐         ┌──────────────┐        │
│  │   Client     │         │  Publisher   │        │
│  │              │         │              │        │
│  │ • Deposits   │         │ • Registers  │        │
│  │ • Buys       │         │ • Verifies   │        │
│  │   Tickets    │         │   Tickets    │        │
│  │ • Uses API   │         │ • Withdraws  │        │
│  └──────┬───────┘         └──────┬───────┘        │
│         │                        │                 │
│         └────────┬───────────────┘                 │
│                  │                                 │
│         ┌────────▼─────────┐                      │
│         │  Smart Contract  │                      │
│         │                  │                      │
│         │ • Balances       │                      │
│         │ • Tickets        │                      │
│         │ • Payments       │                      │
│         └──────────────────┘                      │
│                                                     │
│         Blockchain (Ethereum / L2)                 │
└─────────────────────────────────────────────────────┘
```

Happy building! 🚀

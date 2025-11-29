/**
 * Example: ARTICL Publisher Server
 *
 * This example shows how to set up an Express.js API server
 * that uses ARTICL for pay-per-call access control
 */

import express from 'express';
import { ethers } from 'ethers';
import { createEnhancedARTICLMiddleware } from './publisher-middleware';

const app = express();
const PORT = 3000;

// Setup provider
const provider = new ethers.JsonRpcProvider('http://localhost:8545');

// Your publisher address (the one you registered with)
const PUBLISHER_ADDRESS = '0x...'; // Replace with your address

// Create ARTICL middleware
const articlMiddleware = createEnhancedARTICLMiddleware({
  contractAddress: '0x...', // Your deployed ARTICL contract
  provider,
  publisherAddress: PUBLISHER_ADDRESS,
  cache: true, // Enable caching for better performance
  autoConsume: false, // Don't auto-consume (you can do it manually in batches)

  // Optional: Track requests
  onRequest: (ticketHash, req) => {
    console.log(`📥 Request from ${req.ip} with ticket ${ticketHash.slice(0, 10)}...`);
  },

  onValidTicket: (ticketHash, req) => {
    console.log(`✅ Valid ticket ${ticketHash.slice(0, 10)}... - allowing request`);
  },

  onInvalidTicket: (ticketHash, req) => {
    console.log(`❌ Invalid ticket ${ticketHash.slice(0, 10)}... - denying request`);
  }
});

// Public endpoint (no authentication required)
app.get('/api/public', (req, res) => {
  res.json({
    message: 'This is a public endpoint',
    info: 'To access premium endpoints, buy tickets using ARTICL'
  });
});

// Protected endpoints (require ARTICL tickets)
app.get('/api/data', articlMiddleware, (req, res) => {
  res.json({
    data: 'This is premium data',
    timestamp: Date.now(),
    message: 'Your ticket was valid! ✅'
  });
});

app.get('/api/premium/users', articlMiddleware, async (req, res) => {
  // Simulate some expensive computation
  const users = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
    { id: 3, name: 'Charlie', email: 'charlie@example.com' }
  ];

  res.json({ users });
});

app.post('/api/premium/process', articlMiddleware, express.json(), (req, res) => {
  res.json({
    message: 'Data processed successfully',
    input: req.body,
    processedAt: Date.now()
  });
});

// Info endpoint explaining how to use the API
app.get('/', (req, res) => {
  res.json({
    name: 'ARTICL Protected API',
    description: 'Pay-per-call API using ARTICL Protocol',
    endpoints: {
      public: {
        'GET /api/public': 'Public endpoint (no ticket required)'
      },
      protected: {
        'GET /api/data': 'Get premium data (requires ticket)',
        'GET /api/premium/users': 'Get user list (requires ticket)',
        'POST /api/premium/process': 'Process data (requires ticket)'
      }
    },
    howToUse: [
      '1. Buy tickets from the ARTICL contract',
      '2. Include your ticket secret in the X-ARTICL-Access-Key header',
      '3. Make your API request',
      'Example: curl -H "X-ARTICL-Access-Key: YOUR_SECRET" http://localhost:3000/api/data'
    ],
    contract: {
      address: '0x...', // Your contract address
      publisherAddress: PUBLISHER_ADDRESS
    }
  });
});

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║   ARTICL Protected API Server                   ║
╚═══════════════════════════════════════════════╝

🚀 Server running on http://localhost:${PORT}

📊 Publisher Address: ${PUBLISHER_ADDRESS}

Endpoints:
  • GET  /              - API info
  • GET  /api/public   - Public endpoint
  • GET  /api/data     - Premium data (requires ticket)

To use protected endpoints:
  1. Buy tickets using the ARTICL client
  2. Use ticket secret as X-ARTICL-Access-Key header

Example:
  curl -H "X-ARTICL-Access-Key: YOUR_SECRET" \\
       http://localhost:${PORT}/api/data

`);
});

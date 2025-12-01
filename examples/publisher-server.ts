/**
 * Example: ARTICL Publisher Server (EIP-712 call flow)
 *
 * Buyers send signed call payloads in the request body:
 * {
 *   "buyer": "0x...",
 *   "apiId": "1",
 *   "amount": "25000000",
 *   "nonce": "1",
 *   "signature": "0x..."
 * }
 */

import express from "express";
import { ethers } from "ethers";
import { createARTICLMiddleware } from "./publisher-middleware";

const app = express();
const PORT = 3000;

// Setup provider and signer (publisher signs redeemCall)
const provider = new ethers.JsonRpcProvider("http://localhost:8545");
const publisherSigner = new ethers.Wallet("YOUR_PUBLISHER_PRIVATE_KEY", provider);

const MARKETPLACE_ADDRESS = "0x..."; // deployed marketplace
const TOKEN_ADDRESS = "0x..."; // deployed ARTICL token

// Parse JSON bodies
app.use(express.json());

// Create ARTICL middleware (verifies sig + allowance, optionally redeems)
const articlMiddleware = createARTICLMiddleware({
  marketplaceAddress: MARKETPLACE_ADDRESS,
  tokenAddress: TOKEN_ADDRESS,
  provider,
  signer: publisherSigner,
  autoRedeem: true,
  onRequest: (payload) => console.log(`📥 Call from ${payload.buyer} for api ${payload.apiId}`),
  onValid: (payload) => console.log(`✅ Authorized call nonce ${payload.nonce}`),
  onInvalid: (reason, payload) => console.log(`❌ Rejected call: ${reason}`, payload),
});

// Public endpoint (no auth)
app.get("/api/public", (_req, res) => {
  res.json({ message: "Public endpoint" });
});

// Protected endpoints
app.post("/api/data", articlMiddleware, (req, res) => {
  res.json({ data: "Premium data", ts: Date.now() });
});

// Info endpoint
app.get("/", (_req, res) => {
  res.json({
    name: "ARTICL Protected API",
    description: "Pay-per-call API using signed ARTICL calls",
    contract: {
      marketplace: MARKETPLACE_ADDRESS,
      token: TOKEN_ADDRESS,
    },
    howToUse: [
      "1. Mint ARTICL by sending ETH to the token",
      "2. Approve the marketplace as spender",
      "3. Sign the Call message (buyer, apiId, amount, nonce) using EIP-712",
      "4. POST the signed payload to this server",
    ],
  });
});

app.listen(PORT, () => {
  console.log(`🚀 ARTICL publisher server running on http://localhost:${PORT}`);
});

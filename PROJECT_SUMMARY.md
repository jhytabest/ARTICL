# ARTICL - Project Summary

**Full Name**: ARTICL - API Resource Ticket Incentive & Compensation Ledger  
**License**: MIT  
**Status**: Two-contract architecture (ETH-backed token + marketplace)

---

## What is ARTICL?

ARTICL is a wrapped-ETH ERC20 plus a marketplace for signed, per-call API payments. Buyers mint ARTICL with ETH, approve the marketplace, sign an EIP-712 `Call` message (buyer, apiId, amount, nonce), and send it to the publisher. Publishers verify off-chain, then redeem on-chain to pull ARTICL; the marketplace never touches ETH directly.

---

## Test Results

✅ `forge test` — 10 tests (token + marketplace) passing  
❌ 0 failures

---

## Project Structure

```
src/
  ARTICL.sol              # ETH-backed ERC20 (1 ETH = 1e8 ARTICL)
  ARTICLMarketplace.sol   # Registry + EIP-712 redeem/batch
test/
  ARTICLToken.t.sol
  ARTICLMarketplace.t.sol
client-sdk/
  src/ARTICLClient.ts     # Token + marketplace helpers + EIP-712 signing
  src/abi.token.json
  src/abi.marketplace.json
examples/
  client-example.ts       # Buyer mint/approve/sign payload
  publisher-middleware.ts # Off-chain verification + optional redeem
  publisher-server.ts     # Express server wiring
README.md
PROTOCOL_SPEC.md
QUICK_START.md
```

---

## Quick Start

```bash
forge build && forge test
# Deploy token + marketplace, then see QUICK_START.md for full flow
```

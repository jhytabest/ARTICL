# ARTICL Protocol Specification (wrapped ETH + marketplace)

## Overview

ARTICL is split into two contracts:
- **ARTICL token** — an ETH-backed ERC20 wrapper. `mint()` accepts ETH and mints ARTICL at a fixed rate of `1 ETH = 100,000,000 ARTICL` (conversion factor 10^8). `redeem()` burns ARTICL and sends back ETH. Decimals are `0`, so 1 ARTICL = 1e-8 ETH.
- **Marketplace** — coordinates API payments. It never touches ETH, only ARTICL balances/allowances. Buyers sign EIP-712 messages authorizing specific payments; publishers redeem them on-chain.

## Contracts

### ARTICL (ERC20 wrapper)
- `mint(address to)` payable → mints `(msg.value * 1e8)` ARTICL.
- `redeem(uint256 amount, address to)` → burns `amount` ARTICL and sends `(amount * 1e18 / 1e8)` wei.
- Standard `transfer/approve/transferFrom/allowance/balanceOf/totalSupply`.
- Events: `Minted(minter, ethIn, tokenOut)`, `Redeemed(redeemer, to, burned, ethOut)`, ERC20 `Transfer/Approval`.
- Invariant: totalSupply ARTICL * 1e10 wei = ETH held.

### Marketplace
- Stores API offerings: `registerApi(name, metadataURI, recommendedPrice) -> apiId`, `updateApi`.
- Redeems signed calls: `redeemCall(SignedCall)`, `redeemCalls(SignedCall[])` (atomic batch, aggregates transfers by buyer, pays publishers).
- Replay protection: `usedNonces[buyer][nonce]`.
- Helper: `hashCall(buyer, apiId, amount, nonce)` returns the EIP-712 digest used for signatures.

#### EIP-712 details
- Domain: `{ name: "ARTICLMarketplace", version: "1", chainId, verifyingContract: marketplace }`
- Types:
  ```solidity
  Call(address buyer,uint256 apiId,uint256 amount,uint256 nonce)
  ```
- Message fields:
  - `buyer`: address of the payer
  - `apiId`: uint256 offering id
  - `amount`: ARTICL to pay (0 decimals)
  - `nonce`: single-use, buyer-scoped

## Flows

### Buyer funding
1. Call `ARTICL.mint(to)` with ETH. Receives ARTICL in wallet.
2. Call `ARTICL.approve(marketplace, allowance)` to permit marketplace pulls.

### API registration (publisher)
1. `registerApi(name, metadataURI, recommendedPrice)` — assigns incremental `apiId`, stores publisher address.
2. Optional `updateApi` to change metadata or recommended price (off-chain UI hint only).

### Off-chain call authorization (buyer)
1. Choose `{apiId, amount, nonce}`.
2. Build EIP-712 typed data (domain above) and sign with wallet → `signature`.
3. Send `{buyer, apiId, amount, nonce, signature}` alongside HTTP request to publisher.

### Off-chain validation (publisher backend)
1. Rebuild domain using on-chain chainId + marketplace address.
2. Recover signer with `verifyTypedData`; ensure `signer == buyer`.
3. Optionally fetch `marketplace.hashCall` and compare to local digest.
4. Optionally check `usedNonces[buyer][nonce]` (view), `allowance >= amount`, `balance >= amount`.
5. If acceptable, call `redeemCall` (single) or collect multiple payloads for `redeemCalls` (batch).

### On-chain redemption
- **Single**: `redeemCall` verifies signature + unused nonce, then `transferFrom(buyer, publisher, amount)`. On success, marks nonce used and emits `CallRedeemed`.
- **Batch (optimized)**: `redeemCalls` verifies all entries first, aggregates totals per buyer, pulls once per buyer, pays publishers, then marks all nonces and emits events. Whole batch is atomic — any failure reverts all.

### Exiting to ETH
- Anyone holding ARTICL calls `redeem(amount, to)` on the token to receive ETH. Marketplace never handles ETH directly.

## Message format to send to publishers
```json
{
  "buyer": "0xBuyer",
  "apiId": "1",
  "amount": "25000000",
  "nonce": "42",
  "signature": "0x..."
}
```
Publishers can optionally include the digest from `hashCall` for logging/debugging.

# ARTICL — ETH-backed token + marketplace for per-call API payments

ARTICL now runs on two contracts:
- **ARTICL (ERC20)** — wrapped ETH. Send ETH to mint ARTICL (1 ETH = 100,000,000 ARTICL). Burn ARTICL to get ETH back.
- **Marketplace** — coordinates API payments via EIP-712 signed call authorizations. It only moves ARTICL; it never touches ETH.

The buyer mints ARTICL, approves the marketplace, signs a `Call` message for a specific API, and hands that payload to the publisher. The publisher verifies off-chain, then redeems on-chain to pull ARTICL from the buyer to themselves.

## Contract summary

- Token: `mint(address to)` payable, `redeem(uint256 amount,address to)`, standard ERC20 transfers/approvals, decimals = 0, conversion factor = `1e8`.
- Marketplace:
  - `registerApi(name, metadataURI, recommendedPrice) -> apiId`
  - `updateApi(apiId, metadataURI, recommendedPrice)`
  - `redeemCall(SignedCall)` / `redeemCalls(SignedCall[])` (batch, atomic, aggregated by buyer)
  - `hashCall(buyer, apiId, amount, nonce)` helper; `usedNonces[buyer][nonce]` replay protection
- EIP-712 domain: `{ name: "ARTICLMarketplace", version: "1", chainId, verifyingContract: marketplace }`
- Typed data: `Call(address buyer,uint256 apiId,uint256 amount,uint256 nonce)`

## Repo layout

```
src/ARTICL.sol              # ERC20 wrapper token
src/ARTICLMarketplace.sol   # Marketplace + EIP-712 redeem logic
test/ARTICLToken.t.sol      # Token tests
test/ARTICLMarketplace.t.sol# Marketplace tests
client-sdk/                 # TypeScript SDK (token + marketplace + signing helpers)
examples/                   # Buyer + publisher HTTP examples (signed Call flow)
PROTOCOL_SPEC.md            # Detailed protocol description
```

## Quick start (local)

```bash
forge build
forge test
```

Deploy token then marketplace (passing token address). Example with Anvil account:
```bash
anvil
# new terminal
TOKEN=$(forge create src/ARTICL.sol:ARTICL --private-key $PK --rpc-url http://localhost:8545 | grep "Deployed to" | awk '{print $3}')
MP=$(forge create src/ARTICLMarketplace.sol:ARTICLMarketplace --constructor-args $TOKEN --private-key $PK --rpc-url http://localhost:8545 | grep "Deployed to" | awk '{print $3}')
echo "Token: $TOKEN"
echo "Marketplace: $MP"
```

## Buyer flow

```ts
import { ARTICLClient } from "./client-sdk/src";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("http://localhost:8545");
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

const client = new ARTICLClient({
  tokenAddress: TOKEN,
  marketplaceAddress: MARKETPLACE,
  provider,
  signer,
});

// 1) Mint ARTICL with ETH
await (await client.mint(await signer.getAddress(), ethers.parseEther("1"))).wait();

// 2) Approve marketplace
await (await client.approveMarketplace(ethers.MaxUint256)).wait();

// 3) Sign a Call (EIP-712)
const signed = await client.signCall({ apiId: 1n, amount: 25_000_000n, nonce: 1n });
// send {buyer, apiId, amount, nonce, signature} to publisher HTTP endpoint
```

## Publisher flow (server-side)

1) Register your API: `marketplace.registerApi(name, metadataURI, recommendedPrice)` → `apiId`.
2) Accept HTTP requests that include `{ buyer, apiId, amount, nonce, signature }`.
3) Verify off-chain:
   - Rebuild domain (chainId + marketplace address).
   - `ethers.verifyTypedData(domain, CallTypes, message, signature) == buyer`.
   - Optional: compare `TypedDataEncoder.hash(...)` with `marketplace.hashCall(...)`.
   - Optional: check `allowance` and `balance` on the token.
4) Redeem on-chain: call `redeemCall(payload)` (or batch via `redeemCalls`).

See `examples/publisher-middleware.ts` and `examples/publisher-server.ts` for an Express middleware that performs the verification and optionally redeems on-chain.

For a full runnable setup, read `PUBLISHER_INTEGRATION.md`.

## Client SDK highlights (`client-sdk/src/ARTICLClient.ts`)
- `mint`, `redeem`, `approveMarketplace`, `balanceOf`, `allowance`
- `registerApi`, `updateApi`, `redeemCallOnChain`, `redeemCallsOnChain`
- `signCall` (EIP-712), `recoverCallSigner`, `hashCall`
- Exports `CALL_TYPED_DATA` for shared typed-data encoding.

## Protocol spec
See `PROTOCOL_SPEC.md` for the full description of message formats, domain separator, batching semantics, and ETH backing rules.

# Publisher Integration Guide (ARTICL)

This guide turns the `examples/` scaffolding into a runnable publisher flow.

> **North Star alignment:** This directly advances **Top Priority #2 — “🔌 End-to-End Publisher Flow”** from `NORTHSTAR.md` by making one real publisher path easy to stand up and validate.

## What you will run

- An API server (`examples/publisher-server.ts`) with ARTICL middleware
- Signature verification for incoming `Call` payloads
- Optional automatic on-chain redemption (`redeemCall`)

## Prerequisites

- Node.js 20+
- An RPC URL (local Anvil or Base Sepolia)
- Deployed contract addresses:
  - `ARTICL` token
  - `ARTICLMarketplace`
- A publisher wallet private key (for `registerApi` / optional `autoRedeem`)

---

## 1) Install dependencies

From repo root:

```bash
npm install
```

If your setup does not install root deps, install the minimum runtime set:

```bash
npm install express ethers tsx
npm install -D typescript @types/express
```

---

## 2) Configure environment

Create `.env.publisher` in repo root:

```bash
RPC_URL=http://localhost:8545
PORT=3000
MARKETPLACE_ADDRESS=0xYourMarketplace
TOKEN_ADDRESS=0xYourToken
PUBLISHER_PRIVATE_KEY=0xYourPrivateKey
AUTO_REDEEM=true
```

Notes:

- `AUTO_REDEEM=true`: middleware redeems valid calls immediately.
- `AUTO_REDEEM=false`: server verifies only; you can batch redeem later.

---

## 3) (Optional) Register your API to get `apiId`

Use a quick script/console call with your publisher signer:

```ts
import { ethers } from "ethers";
import marketplaceAbi from "./client-sdk/src/abi.marketplace.json";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);
const signer = new ethers.Wallet(process.env.PUBLISHER_PRIVATE_KEY!, provider);
const marketplace = new ethers.Contract(process.env.MARKETPLACE_ADDRESS!, marketplaceAbi, signer);

const tx = await marketplace.registerApi(
  "Weather API",
  "ipfs://weather-api-metadata",
  25_000_000n // 0.25 ETH worth of ARTICL units at 1e8/ETH
);
await tx.wait();
```

Capture emitted `apiId` from `ApiRegistered` event.

---

## 4) Start publisher server

`examples/publisher-server.ts` currently has placeholder constants; replace those with env lookups before running:

```ts
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://localhost:8545");
const publisherSigner = new ethers.Wallet(process.env.PUBLISHER_PRIVATE_KEY!, provider);

const MARKETPLACE_ADDRESS = process.env.MARKETPLACE_ADDRESS!;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS!;
const PORT = Number(process.env.PORT || 3000);
```

Then run:

```bash
set -a; source .env.publisher; set +a
npx tsx examples/publisher-server.ts
```

Expected startup:

```text
🚀 ARTICL publisher server running on http://localhost:3000
```

---

## 5) Send a signed call from buyer

Use `ARTICLClient` on buyer side:

```ts
const signed = await client.signCall({
  apiId: 1n,
  amount: 25_000_000n,
  nonce: 1n,
});

await fetch("http://localhost:3000/api/data", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(signed),
});
```

Middleware checks:

1. payload shape present
2. API allowlist (if configured)
3. EIP-712 signature recovers `buyer`
4. local digest equals `marketplace.hashCall(...)`
5. buyer allowance + balance sanity checks
6. optional on-chain `redeemCall`

Success response from protected endpoint:

```json
{ "data": "Premium data", "ts": 1700000000000 }
```

---

## 6) Troubleshooting

### `Missing ARTICL payload`
Your JSON body is missing one of: `buyer`, `apiId`, `amount`, `nonce`, `signature`.

### `Invalid signature` / `Digest mismatch`
Most common causes:
- wrong `chainId`
- wrong `verifyingContract` (marketplace address)
- buyer signed a different `(apiId, amount, nonce)`

### `Insufficient allowance or balance`
Buyer must:
- mint enough ARTICL
- approve marketplace for at least `amount`

### Redeem transaction reverts
Check:
- nonce already used
- payload signed for another marketplace/domain
- buyer approval changed since pre-check

---

## Production recommendations

- Keep `AUTO_REDEEM=false` for high throughput APIs and batch with `redeemCalls`.
- Add idempotency keys in your HTTP layer to avoid duplicate work.
- Persist accepted call payloads and redemption tx hashes for auditability.
- Use queue + retry workers for on-chain submission.
- Add monitoring for redeem failures and nonce-reuse attempts.

This keeps API latency low while preserving the North Star architecture direction: **“Off-chain verification, on-chain settlement.”**

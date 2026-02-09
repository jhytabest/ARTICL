# ARTICL — North Star

> **API Resource Ticket Incentive & Compensation Ledger**
> Per-call API payments on Ethereum, powered by ETH-backed tokens and EIP-712 signatures.

---

## Vision

Make API monetization as simple as a signed HTTP header. No subscriptions, no API keys, no invoicing — just cryptographic proof of willingness to pay, settled on-chain. ARTICL is the Stripe of API calls for the decentralized web.

---

## Current State (Feb 2026)

### What exists
- **Smart contracts** (Foundry/Solidity 0.8.20): ETH-backed ERC20 wrapper (`ARTICL.sol`) + marketplace with EIP-712 signed call redemption (`ARTICLMarketplace.sol`). 10 passing tests.
- **TypeScript Client SDK** (`client-sdk/`): Full coverage — mint, redeem, approve, sign calls, verify, batch redeem. Vitest tests.
- **Farcaster Miniapp** (`articl-miniapp/`): Next.js 16 app with 3 pages (home, `/articl` wallet, `/publish`). Uses Alchemy SDK. Hooks for wallet + market data. Playwright e2e + Vitest unit tests.
- **CI**: GitHub Actions running Forge tests, SDK tests, miniapp tests + build check.
- **Docs**: README, PROTOCOL_SPEC, QUICK_START, PROJECT_SUMMARY.

### What's missing
- No mainnet/testnet deployment — contracts are local-only (Anvil).
- No publisher example server running anywhere.
- Miniapp has no live contract integration (needs deployed addresses).
- No monitoring, analytics, or usage tracking.
- No fee model or protocol revenue mechanism.

---

## Top 3 Priorities

### 1. 🚀 Deploy to Testnet (Base Sepolia)
Get contracts live on a public testnet. Wire up the miniapp with real addresses. This unblocks everything else — can't demo what doesn't exist on-chain.

### 2. 🔌 End-to-End Publisher Flow
Build a working publisher that accepts signed calls, verifies, serves an API response, and redeems on-chain. The `examples/` directory has scaffolding but nothing runnable end-to-end. Need at least one real API behind ARTICL to prove the concept.

### 3. 📱 Miniapp Polish & Farcaster Distribution
The Farcaster miniapp is the distribution channel. Connect it to deployed contracts, add real wallet connect flow, show live market data, and make publishing an API a 2-click experience from within Farcaster.

---

## Key Metrics (targets)

| Metric | Target | Current |
|--------|--------|---------|
| Contracts deployed (testnet) | 1 chain | 0 |
| APIs registered | 5+ | 0 |
| Unique buyers (testnet) | 20+ | 0 |
| Calls redeemed | 100+ | 0 |
| SDK npm downloads/week | 50+ | not published |
| Miniapp DAU | 10+ | 0 |

---

## Architecture Direction

```
┌─────────────┐     EIP-712 signed call      ┌──────────────────┐
│  Buyer App  │ ──────────────────────────▶   │  Publisher Server │
│  (miniapp)  │                               │  (verify + serve) │
└──────┬──────┘                               └────────┬─────────┘
       │ mint / approve                                │ redeemCall(s)
       ▼                                               ▼
┌──────────────────────────────────────────────────────────┐
│                    Base (L2)                              │
│  ┌────────────┐          ┌─────────────────────┐         │
│  │ ARTICL.sol │◀────────▶│ ARTICLMarketplace.sol│        │
│  │ (ERC20)    │  approve │ (EIP-712 redeem)     │        │
│  └────────────┘          └─────────────────────┘         │
└──────────────────────────────────────────────────────────┘
```

- **L2-first**: Deploy on Base for low gas. Mainnet later if demand justifies it.
- **Off-chain verification, on-chain settlement**: Publishers verify signatures instantly, batch-redeem periodically. This keeps API latency low.
- **SDK-driven**: The TypeScript SDK is the primary integration surface. Keep it lean, well-typed, zero unnecessary dependencies.
- **Miniapp as storefront**: Farcaster miniapp = discovery + wallet + marketplace UI. Not a separate product — it's the front door.

---

## Anti-Goals

- **Not a general-purpose payment protocol.** ARTICL is specifically for per-call API payments. Don't scope-creep into subscriptions, streaming payments, or DeFi.
- **Not a token with speculative value.** ARTICL is ETH-wrapped 1:1. No bonding curves, no liquidity pools, no trading pairs. It's a unit of account, not an investment.
- **Not a custodial platform.** Publishers and buyers hold their own keys. ARTICL never custodies funds (marketplace pulls via `transferFrom`, never holds balances long-term).
- **Not trying to replace Stripe.** We're complementary — for APIs where crypto-native payment makes sense (permissionless, pseudonymous, microtransactions).
- **No governance tokens, DAOs, or protocol politics.** Ship product, not committees.

---

*Last updated: 2026-02-09 by Shober (CTO)*

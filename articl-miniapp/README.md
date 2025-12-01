# ARTICL Mini App (Base Mini App ready)

A minimal Next.js front end for ARTICL that:
- Uses `ARTICLClient` (copied from the contract repo) to deposit, buy tickets, and verify secrets.
- Calls `sdk.actions.ready()` so it can run as a Base Mini App.
- Hosts a placeholder manifest at `public/.well-known/farcaster.json`.
- Adds the required `fc:miniapp` metadata in `app/layout.tsx`.

## Setup

```bash
cd articl-miniapp
npm install
cp .env.example .env.local
```

Fill in `.env.local`:
- `NEXT_PUBLIC_RPC_URL` — Base RPC (we set the Alchemy URL used above in `.env.example`)
- `NEXT_PUBLIC_ARTICL_ADDRESS` — deployed ARTICL on Base mainnet (already filled: `0x58Da8f333587FD921b6055c868a9da495302751D`)
- `NEXT_PUBLIC_PUBLISHER_ADDRESS` — your publisher address on Base (set this after you register)

Then run:

```bash
npm run dev
```

## Manifest (mini app)
Edit `public/.well-known/farcaster.json` with your URLs, icon/splash assets, and `baseBuilder.ownerAddress` (your Base address).
Once deployed publicly, use the Base Build Account Association tool to generate `accountAssociation` and paste the `header/payload/signature` back into the manifest, then redeploy.

## Embeds
`app/layout.tsx` already includes the `fc:miniapp` meta tag. Update the URLs (image, splash, launch URL) to your deployed domain.
## Publisher registration (on Base)
Use your publisher wallet on Base and call `registerPublisher(domain, pricePerCall, payoutWallet)` against the deployed contract address above. You can use `cast send`, Foundry scripts, or a small ethers script. Set `NEXT_PUBLIC_PUBLISHER_ADDRESS` to that wallet.

You can also use the helper script here:
```bash
RPC_URL=https://base-mainnet.g.alchemy.com/v2/wl3Q-lQRA_TMPtJ6v1jSe \
PRIVATE_KEY=0x<your_publisher_key> \
DOMAIN=api.yourdomain.com \
PRICE_ETHER=0.001 \
PAYOUT_WALLET=0xYourPayoutWallet \
CONTRACT=0x58Da8f333587FD921b6055c868a9da495302751D \
npm run register:publisher
```

# ARTICL Quick Start (wrapped ETH + marketplace)

## Prereqs
- Node 18+
- Foundry
- A JSON-RPC endpoint (Anvil for local)

## 1) Install
```bash
forge build
cd client-sdk && npm install && cd ..
```

## 2) Deploy locally
```bash
anvil
```
New terminal:
```bash
export RPC=http://localhost:8545
export PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

TOKEN=$(forge create src/ARTICL.sol:ARTICL --rpc-url $RPC --private-key $PK | awk '/Deployed to/ {print $3}')
MP=$(forge create src/ARTICLMarketplace.sol:ARTICLMarketplace --constructor-args $TOKEN --rpc-url $RPC --private-key $PK | awk '/Deployed to/ {print $3}')
echo "Token  : $TOKEN"
echo "Market : $MP"
```

## 3) Register an API (publisher)
```bash
cast send $MP "registerApi(string,string,uint256)" "Weather" "ipfs://metadata/weather" 123 \
  --rpc-url $RPC --private-key $PK
```
Returned `apiId` starts at 1.

## 4) Buyer flow (sign a Call)
```ts
import { ARTICLClient } from "./client-sdk/src";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider($RPC);
const signer = new ethers.Wallet("SECOND_ACCOUNT_PRIVKEY", provider);
const client = new ARTICLClient({ tokenAddress: TOKEN, marketplaceAddress: MP, provider, signer });

await (await client.mint(await signer.getAddress(), ethers.parseEther("1"))).wait();
await (await client.approveMarketplace(ethers.MaxUint256)).wait();

const signed = await client.signCall({ apiId: 1n, amount: 25_000_000n, nonce: 1n });
console.log(JSON.stringify(signed, null, 2));
```
Send that JSON to the publisher’s HTTP endpoint.

## 5) Publisher server
Use `examples/publisher-server.ts` as a template. It:
- Verifies the EIP-712 signature off-chain (domain = `ARTICLMarketplace`, version `1`, chainId, marketplace address).
- Optionally checks allowance/balance.
- Calls `redeemCall` on-chain (autoRedeem).

Run:
```bash
npm install express
ts-node examples/publisher-server.ts
```

## 6) Tests
```bash
forge test
```

## Reference
- Protocol details: `PROTOCOL_SPEC.md`
- SDK API: `client-sdk/src/ARTICLClient.ts`

/**
 * Example: buyer flow for the new two-contract architecture.
 *
 * Steps:
 * 1) Mint ARTICL by sending ETH
 * 2) Approve marketplace to spend ARTICL
 * 3) Build & sign a Call (EIP-712) for a specific API id / amount / nonce
 * 4) Send the signed payload to the publisher's backend (off-chain)
 */

import { ethers } from "ethers";
import { ARTICLClient } from "../client-sdk/src";

async function main() {
  const provider = new ethers.JsonRpcProvider("http://localhost:8545"); // Anvil/Hardhat
  const signer = new ethers.Wallet("YOUR_PRIVATE_KEY", provider);

  const TOKEN_ADDRESS = "0x..."; // deployed ARTICL token
  const MARKETPLACE_ADDRESS = "0x..."; // deployed marketplace

  const articl = new ARTICLClient({
    tokenAddress: TOKEN_ADDRESS,
    marketplaceAddress: MARKETPLACE_ADDRESS,
    provider,
    signer,
  });

  const buyer = await signer.getAddress();
  console.log("Buyer:", buyer);

  console.log("\n1) Minting ARTICL for 1 ETH...");
  await (await articl.mint(buyer, ethers.parseEther("1"))).wait();
  console.log("   Balance:", (await articl.balanceOf(buyer)).toString(), "ARTICL");

  console.log("\n2) Approving marketplace to spend ARTICL...");
  await (await articl.approveMarketplace(ethers.MaxUint256)).wait();

  const apiId = 1n; // obtained from publisher's listing
  const amount = 25_000_000n; // pays 0.25 ETH given 1 ARTICL = 1e-8 ETH
  const nonce = 1n; // single-use

  console.log("\n3) Signing call authorization (EIP-712) ...");
  const signed = await articl.signCall({ apiId, amount, nonce });
  const digest = await articl.hashCall(signed);
  console.log("   Signature:", signed.signature);
  console.log("   Digest:", digest);

  console.log("\n4) Send this payload to the publisher's HTTP endpoint:");
  console.log(
    JSON.stringify(
      {
        buyer: signed.buyer,
        apiId: signed.apiId.toString(),
        amount: signed.amount.toString(),
        nonce: signed.nonce.toString(),
        signature: signed.signature,
        digest,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

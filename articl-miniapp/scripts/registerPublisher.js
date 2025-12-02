/* eslint-disable @typescript-eslint/no-require-imports */
const { ethers } = require("ethers");

async function main() {
  const {
    RPC_URL,
    PRIVATE_KEY,
    CONTRACT = process.env.NEXT_PUBLIC_ATRICL_ADDRESS,
    DOMAIN,
    PRICE_ETHER,
    PAYOUT_WALLET,
  } = process.env;

  if (!RPC_URL) throw new Error("RPC_URL is required");
  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY is required");
  if (!CONTRACT) throw new Error("CONTRACT (ARTICL address) is required");
  if (!DOMAIN) throw new Error("DOMAIN is required");
  if (!PRICE_ETHER) throw new Error("PRICE_ETHER (e.g. 0.001) is required");
  if (!PAYOUT_WALLET) throw new Error("PAYOUT_WALLET is required");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  const abi = require("../src/lib/articl/abi.json");
  const contract = new ethers.Contract(CONTRACT, abi, signer);

  console.log("Registering publisher...");
  console.log("  Domain:", DOMAIN);
  console.log("  Price per call (ETH):", PRICE_ETHER);
  console.log("  Payout wallet:", PAYOUT_WALLET);
  console.log("  Sender:", await signer.getAddress());

  const priceWei = ethers.parseEther(PRICE_ETHER);
  const tx = await contract.registerPublisher(DOMAIN, priceWei, PAYOUT_WALLET);
  console.log("TX sent:", tx.hash);
  await tx.wait();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { NextResponse } from "next/server";
import { Alchemy, Network } from "alchemy-sdk";
import { ethers } from "ethers";

const tokenAddress = process.env.NEXT_PUBLIC_TOKEN_ADDRESS;
const marketplaceAddress = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS;
const apiKey = process.env.ALCHEMY_API_KEY || "";
const scanFromBlock = process.env.NEXT_PUBLIC_SCAN_FROM_BLOCK || "0";

const iface = new ethers.Interface([
  "event ApiRegistered(uint256 indexed apiId, address indexed publisher, string name, string metadataURI, uint256 recommendedPrice)",
  "event ApiUpdated(uint256 indexed apiId, string metadataURI, uint256 recommendedPrice)",
  "event CallRedeemed(address indexed buyer, address indexed publisher, uint256 indexed apiId, uint256 amount, uint256 nonce)",
  "event Minted(address indexed minter, uint256 ethIn, uint256 tokenOut)",
  "event Redeemed(address indexed redeemer, address indexed to, uint256 burned, uint256 ethOut)",
]);

const topics = {
  register: iface.getEventTopic("ApiRegistered"),
  update: iface.getEventTopic("ApiUpdated"),
  call: iface.getEventTopic("CallRedeemed"),
  minted: iface.getEventTopic("Minted"),
  redeemed: iface.getEventTopic("Redeemed"),
};

const formatArticlToEth = (value: bigint) => ethers.formatUnits(value, 8);

const toNumber = (value: string | number | bigint | undefined) => {
  if (value === undefined) return 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return Number(value);
};

const normalizeMetadataUri = (uri: string) => {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.replace("ipfs://", "")}`;
  return uri;
};

async function fetchMetadata(uri: string) {
  const url = normalizeMetadataUri(uri);
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json as Record<string, unknown>;
  } catch (err) {
    console.warn(`metadata fetch failed for ${uri}`, err);
    return null;
  }
}

export async function GET() {
  if (!tokenAddress || !marketplaceAddress) {
    return NextResponse.json({ error: "Missing contract address" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "Missing ALCHEMY_API_KEY" }, { status: 400 });
  }

  try {
    const alchemy = new Alchemy({ apiKey, network: Network.BASE_MAINNET });
    const fromBlock = Number(scanFromBlock) || 0;

    const [registerLogs, updateLogs, callLogs, mintLogs, redeemLogs] = await Promise.all([
      alchemy.core.getLogs({ address: marketplaceAddress, fromBlock, toBlock: "latest", topics: [topics.register] }),
      alchemy.core.getLogs({ address: marketplaceAddress, fromBlock, toBlock: "latest", topics: [topics.update] }),
      alchemy.core.getLogs({ address: marketplaceAddress, fromBlock, toBlock: "latest", topics: [topics.call] }),
      alchemy.core.getLogs({ address: tokenAddress, fromBlock, toBlock: "latest", topics: [topics.minted] }),
      alchemy.core.getLogs({ address: tokenAddress, fromBlock, toBlock: "latest", topics: [topics.redeemed] }),
    ]);

    type ApiRow = {
      id: bigint;
      publisher: string;
      name: string;
      metadataURI: string;
      recommendedPrice: bigint;
      lastPaidAmount?: bigint;
      lastPaidAt?: number;
      callCount: number;
      metadata?: Record<string, unknown> | null;
    };

    const apis = new Map<string, ApiRow>();
    const uniquePublishers = new Set<string>();
    let totalVolumeArticl = 0n;

    const combined = [
      ...registerLogs.map((log) => ({ type: "register" as const, log })),
      ...updateLogs.map((log) => ({ type: "update" as const, log })),
      ...callLogs.map((log) => ({ type: "call" as const, log })),
    ].sort((a, b) => {
      const blockDiff = toNumber(a.log.blockNumber) - toNumber(b.log.blockNumber);
      if (blockDiff !== 0) return blockDiff;
      return toNumber(a.log.logIndex) - toNumber(b.log.logIndex);
    });

    combined.forEach(({ type, log }) => {
      if (type === "register") {
        const parsed = iface.parseLog(log);
        const { apiId, publisher, name, metadataURI, recommendedPrice } = parsed.args as unknown as {
          apiId: bigint;
          publisher: string;
          name: string;
          metadataURI: string;
          recommendedPrice: bigint;
        };
        uniquePublishers.add(publisher);
        apis.set(apiId.toString(), {
          id: apiId,
          publisher,
          name,
          metadataURI,
          recommendedPrice,
          callCount: 0,
        });
      }

      if (type === "update") {
        const parsed = iface.parseLog(log);
        const { apiId, metadataURI, recommendedPrice } = parsed.args as unknown as {
          apiId: bigint;
          metadataURI: string;
          recommendedPrice: bigint;
        };
        const existing = apis.get(apiId.toString());
        if (existing) {
          existing.metadataURI = metadataURI;
          existing.recommendedPrice = recommendedPrice;
          apis.set(apiId.toString(), existing);
        }
      }

      if (type === "call") {
        const parsed = iface.parseLog(log);
        const { apiId, amount } = parsed.args as unknown as {
          apiId: bigint;
          amount: bigint;
        };
        const blockNum = toNumber(log.blockNumber);
        const current = apis.get(apiId.toString()) || {
          id: apiId,
          publisher: parsed.args.publisher as string,
          name: `API #${apiId.toString()}`,
          metadataURI: "",
          recommendedPrice: 0n,
          callCount: 0,
        };

        current.callCount += 1;
        if (!current.lastPaidAt || blockNum >= current.lastPaidAt) {
          current.lastPaidAt = blockNum;
          current.lastPaidAmount = amount;
        }
        if (parsed.args.publisher) {
          uniquePublishers.add(parsed.args.publisher as string);
        }
        apis.set(apiId.toString(), current);
        totalVolumeArticl += amount;
      }
    });

    // Hydrate metadata (best-effort)
    const apiList = Array.from(apis.values());
    for (const api of apiList) {
      if (api.metadataURI) {
        api.metadata = await fetchMetadata(api.metadataURI);
      }
    }

    let mintedEth = 0n;
    let redeemedEth = 0n;
    mintLogs.forEach((log) => {
      const parsed = iface.parseLog(log);
      const { ethIn } = parsed.args as unknown as { ethIn: bigint };
      mintedEth += ethIn;
    });
    redeemLogs.forEach((log) => {
      const parsed = iface.parseLog(log);
      const { ethOut } = parsed.args as unknown as { ethOut: bigint };
      redeemedEth += ethOut;
    });

    return NextResponse.json({
      stats: {
        apiCount: apiList.length,
        uniquePublishers: uniquePublishers.size,
        totalCalls: callLogs.length,
        totalVolumeEth: formatArticlToEth(totalVolumeArticl),
        mintedEth: ethers.formatEther(mintedEth),
        redeemedEth: ethers.formatEther(redeemedEth),
      },
      apis: apiList.map((api) => ({
        apiId: api.id.toString(),
        publisher: api.publisher,
        name: api.name,
        metadataURI: api.metadataURI,
        recommendedPriceEth: formatArticlToEth(api.recommendedPrice),
        lastPaidPriceEth: api.lastPaidAmount ? formatArticlToEth(api.lastPaidAmount) : null,
        lastPaidAtBlock: api.lastPaidAt ?? null,
        callCount: api.callCount,
        metadata: api.metadata ?? null,
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { ethers } from "ethers";

const contractAddress = process.env.NEXT_PUBLIC_ARTICL_ADDRESS;
const scanKey = process.env.BASESCAN_KEY || process.env.ETHERSCAN_KEY;
const scanFromBlock = process.env.NEXT_PUBLIC_SCAN_FROM_BLOCK || "0";
const SCAN_URL = "https://api.basescan.org/api";

type Log = { data: string; topics: string[] };

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getBlockNumberByTime(timestamp: number) {
  const params = new URLSearchParams({
    module: "block",
    action: "getblocknobytime",
    timestamp: timestamp.toString(),
    closest: "before",
    apikey: scanKey || "",
  });
  const json = await fetchJson(`${SCAN_URL}?${params.toString()}`);
  if (json.status !== "1") throw new Error(json.result || "Failed to fetch block number");
  return Number(json.result);
}

async function getLogs(topic0: string, fromBlock: string) {
  const params = new URLSearchParams({
    module: "logs",
    action: "getLogs",
    fromBlock,
    toBlock: "latest",
    address: contractAddress || "",
    topic0,
    apikey: scanKey || "",
  });
  const json = await fetchJson(`${SCAN_URL}?${params.toString()}`);
  if (json.status === "0" && json.message === "No records found") return [];
  if (json.status !== "1") throw new Error(json.result || "Failed to fetch logs");
  return json.result as Log[];
}

const getAddressFromTopic = (topic: string) => ethers.getAddress(`0x${topic.slice(26)}`);

export async function GET() {
  if (!contractAddress) {
    return NextResponse.json({ error: "Missing contract address" }, { status: 400 });
  }
  if (!scanKey) {
    return NextResponse.json({ error: "Missing BASESCAN_KEY" }, { status: 400 });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const ts24h = now - 86400;
    const ticketTopic = ethers.id("TicketPurchased(address,address,bytes32,uint256)");
    const depositTopic = ethers.id("Deposit(address,uint256)");
    const publisherTopic = ethers.id("PublisherRegistered(address,string,uint256,address)");

    const [block24h, ticketsAll, deposits, publishers] = await Promise.all([
      getBlockNumberByTime(ts24h),
      getLogs(ticketTopic, scanFromBlock),
      getLogs(depositTopic, scanFromBlock),
      getLogs(publisherTopic, scanFromBlock),
    ]);

    const tickets24h = await getLogs(ticketTopic, block24h.toString());

    const uniquePublishers = new Set<string>();
    publishers.forEach((log) => {
      if (log.topics[1]) uniquePublishers.add(getAddressFromTopic(log.topics[1]));
    });

    let depositsWei = BigInt(0);
    deposits.forEach((log) => {
      depositsWei += BigInt(log.data);
    });

    let volume24Wei = BigInt(0);
    tickets24h.forEach((log) => {
      volume24Wei += BigInt(log.data);
    });

    const publisherCounts: Record<string, { count: number; volume: bigint }> = {};
    ticketsAll.forEach((log) => {
      const pub = log.topics[2] ? getAddressFromTopic(log.topics[2]) : "";
      if (!pub) return;
      if (!publisherCounts[pub]) publisherCounts[pub] = { count: 0, volume: BigInt(0) };
      publisherCounts[pub].count += 1;
      publisherCounts[pub].volume += BigInt(log.data);
    });

    const topPublishers = Object.entries(publisherCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([publisher, info]) => ({
        publisher,
        count: info.count,
        volume: info.volume.toString(),
      }));

    return NextResponse.json({
      apis: uniquePublishers.size,
      calls24h: tickets24h.length,
      depositsEth: ethers.formatEther(depositsWei),
      totalCalls: ticketsAll.length,
      volume24hEth: ethers.formatEther(volume24Wei),
      topPublishers,
      publishers: Array.from(uniquePublishers),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}

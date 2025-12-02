import { useEffect, useMemo, useState } from "react";

export type ApiMeta = {
  apiId: string;
  name: string;
  publisher: string;
  metadataURI: string;
  recommendedPriceEth: string;
  lastPaidPriceEth: string | null;
  lastPaidAtBlock: number | null;
  callCount: number;
  metadata: Record<string, unknown> | null;
};

export type MarketData = {
  stats: {
    apiCount: number;
    uniquePublishers: number;
    totalCalls: number;
    totalVolumeEth: string;
    mintedEth: string;
    redeemedEth: string;
  };
  apis: ApiMeta[];
};

const MOCK_MARKET: MarketData = {
  stats: {
    apiCount: 2,
    uniquePublishers: 2,
    totalCalls: 12,
    totalVolumeEth: "0.4",
    mintedEth: "8",
    redeemedEth: "1",
  },
  apis: [
    {
      apiId: "1",
      name: "Weather feed",
      publisher: "0xabc0000000000000000000000000000000000abc",
      metadataURI: "https://example.com/weather.json",
      recommendedPriceEth: "0.0015",
      lastPaidPriceEth: "0.002",
      lastPaidAtBlock: 123,
      callCount: 4,
      metadata: { category: "data", description: "Realtime weather", tags: ["weather", "data"] },
    },
    {
      apiId: "2",
      name: "Gas oracle",
      publisher: "0xdef0000000000000000000000000000000000def",
      metadataURI: "https://example.com/gas.json",
      recommendedPriceEth: "0.0005",
      lastPaidPriceEth: null,
      lastPaidAtBlock: null,
      callCount: 2,
      metadata: { category: "infra", description: "Base gas data", tags: ["gas", "infra"] },
    },
  ],
};

const tokenAddress = process.env.NEXT_PUBLIC_ATRICL_ADDRESS || "";
const marketplaceAddress = process.env.NEXT_PUBLIC_ARTICLMarketplace_ADDRESS || "";
const testMode = process.env.NEXT_PUBLIC_TEST_MODE === "true";

export function useMarketData() {
  const [market, setMarket] = useState<MarketData | null>(testMode ? MOCK_MARKET : null);
  const [status, setStatus] = useState<{ kind: "idle" | "error" | "success"; message?: string }>(
    testMode ? { kind: "success", message: "Loaded mock catalogue (test mode)" } : { kind: "idle" }
  );

  useEffect(() => {
    if (testMode) return;

    let cancelled = false;
    const load = async () => {
      if (!tokenAddress || !marketplaceAddress) {
        setStatus({ kind: "error", message: "Set token/marketplace addresses first" });
        return;
      }

      try {
        const res = await fetch("/api/market-stats");
        if (!res.ok) {
          setStatus({ kind: "error", message: "Unable to load marketplace data (check RPC/Alchemy/env)" });
          return;
        }
        const json = (await res.json()) as MarketData;
        if (!cancelled) {
          setMarket(json);
          setStatus({ kind: "success" });
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setStatus({ kind: "error", message: "Unable to load marketplace data from Alchemy" });
        }
      }
    };

    void load();
    const interval = setInterval(load, 45_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const categories = useMemo(() => {
    if (!market) return ["all"];
    const set = new Set<string>();
    market.apis.forEach((api) => {
      const cat = (api.metadata?.category as string) || "";
      if (cat) set.add(cat);
    });
    return ["all", ...Array.from(set)];
  }, [market]);

  const tags = useMemo(() => {
    if (!market) return ["all"];
    const set = new Set<string>();
    market.apis.forEach((api) => {
      const tagsValue = api.metadata?.tags;
      if (Array.isArray(tagsValue)) {
        tagsValue.forEach((t) => set.add(String(t)));
      } else if (typeof tagsValue === "string") {
        set.add(tagsValue);
      }
    });
    return ["all", ...Array.from(set)];
  }, [market]);

  return { market, status, categories, tags };
}

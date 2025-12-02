"use client";

import { useEffect, useMemo, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useMarketData } from "@/lib/hooks/useMarketData";

const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

export default function CataloguePage() {
  const { market, status, categories, tags } = useMarketData();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [tag, setTag] = useState("all");

  useEffect(() => {
    sdk.actions.ready().catch(() => {
      /* ignore */
    });
  }, []);

  const filteredApis = useMemo(() => {
    if (!market) return [];
    return market.apis.filter((api) => {
      const matchSearch =
        api.name.toLowerCase().includes(search.toLowerCase()) ||
        api.publisher.toLowerCase().includes(search.toLowerCase());

      const apiCategory = (api.metadata?.category as string) || "";
      const matchesCategory = category === "all" || apiCategory === category;

      const apiTags = Array.isArray(api.metadata?.tags)
        ? (api.metadata?.tags as unknown[]).map((t) => String(t))
        : typeof api.metadata?.tags === "string"
        ? [api.metadata?.tags as string]
        : [];
      const matchesTag = tag === "all" || apiTags.includes(tag);

      return matchSearch && matchesCategory && matchesTag;
    });
  }, [market, search, category, tag]);

  const heroStats = [
    { label: "APIs live", value: market?.stats.apiCount ?? "—", meta: "Catalogue" },
    { label: "Total calls", value: market?.stats.totalCalls ?? "—", meta: `${market?.stats.totalVolumeEth || "—"} ETH` },
    { label: "Minted", value: `${market?.stats.mintedEth || "—"} ETH`, meta: "ARTICL in circulation" },
    { label: "Redeemed", value: `${market?.stats.redeemedEth || "—"} ETH`, meta: "Returned to users" },
  ];

  return (
    <div className="grid-spine">
      <section className="kpi-row">
        <div className="kpi-meta">
          <p className="muted">Marketplace</p>
          <h1>Catalogue of onchain APIs on Base.</h1>
          <p className="lede small">Live stats pulled from Base logs. Filters below update instantly.</p>
        </div>
        {heroStats.map((stat) => (
          <div key={stat.label} className="panel stat-card">
            <p className="muted">{stat.label}</p>
            <div className="stat-value">{stat.value}</div>
            <p className="chip-subtle">{stat.meta}</p>
          </div>
        ))}
      </section>

      <section className="panel stack">
        <div className="section-heading">
          <div>
            <p className="muted">Catalogue</p>
            <h2>Browse APIs</h2>
          </div>
          <span className="chip chip-soft">Filters</span>
        </div>
        <p className="lede small">Find a publisher by name, category, or tags. Cards load instantly below.</p>
        <div className="filters">
          <input
            className="input"
            placeholder="Search by name or publisher"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All categories" : c}
              </option>
            ))}
          </select>
          <select className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t === "all" ? "All tags" : t}
              </option>
            ))}
          </select>
        </div>

        <div className="mini-grid">
          {filteredApis.map((api) => {
            const displayPrice = api.lastPaidPriceEth ?? api.recommendedPriceEth;
            const description =
              (api.metadata?.description as string) ||
              (api.metadata?.summary as string) ||
              (api.metadataURI ? `Metadata: ${api.metadataURI}` : "No metadata yet");
            const metaTags = Array.isArray(api.metadata?.tags)
              ? (api.metadata?.tags as unknown[]).map((t) => String(t))
              : typeof api.metadata?.tags === "string"
              ? [api.metadata?.tags as string]
              : [];
            const categoryLabel = (api.metadata?.category as string) || "uncategorized";
            return (
              <div key={api.apiId} className="mini-card selectable">
                <div className="meta-row">
                  <span className="chip chip-soft">{categoryLabel}</span>
                  <span className="chip-subtle">API #{api.apiId}</span>
                </div>
                <h4>{api.name}</h4>
                <p className="muted">{description}</p>
                <div className="meta-row">
                  <span className="chip-subtle">
                    Last paid: {displayPrice ? `${displayPrice} ETH` : "—"} (
                    {api.lastPaidPriceEth ? "on-chain" : "recommended"})
                  </span>
                  <span className="chip-subtle">{api.callCount} calls</span>
                </div>
                <div className="meta-row">
                  <span className="chip-subtle">Publisher: {formatAddress(api.publisher)}</span>
                  <span className="chip-subtle">Recommended: {api.recommendedPriceEth} ETH</span>
                </div>
                <div className="tag-row">
                  {metaTags.map((t) => (
                    <span key={t} className="chip chip-soft">
                      {t}
                    </span>
                  ))}
                  {!metaTags.length && <span className="chip-subtle">No tags</span>}
                </div>
              </div>
            );
          })}
          {!filteredApis.length && (
            <div className="mini-card">
              <div className="muted">No APIs match these filters.</div>
            </div>
          )}
        </div>
      </section>

      {status.kind === "error" && <div className="status error">{status.message}</div>}
      {status.kind === "success" && status.message && <div className="status">{status.message}</div>}
    </div>
  );
}

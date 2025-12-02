"use client";

import { useEffect, useMemo, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { ethers } from "ethers";
import { ARTICLClient, ARTICL_CONVERSION_FACTOR } from "@/lib/articl";

const tokenAddress = process.env.NEXT_PUBLIC_ATRICL_ADDRESS || "";
const marketplaceAddress = process.env.NEXT_PUBLIC_ARTICLMarketplace_ADDRESS || "";
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "";
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "8453");

type Status = { kind: "idle" | "loading" | "success" | "error"; message?: string };

type ApiMeta = {
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

type MarketData = {
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

const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
const formatArticlToEth = (value: bigint) => ethers.formatUnits(value, 8);
const parseEthToArticl = (value: string) => ethers.parseUnits(value || "0", 8);

export default function Home() {
  const [account, setAccount] = useState<string | null>(null);
  const [writeClient, setWriteClient] = useState<ARTICLClient | null>(null);
  const [balanceArticl, setBalanceArticl] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [mintAmountEth, setMintAmountEth] = useState("0.1");
  const [redeemAmountEth, setRedeemAmountEth] = useState("0.05");
  const [allowanceEth, setAllowanceEth] = useState("1");
  const [market, setMarket] = useState<MarketData | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [tag, setTag] = useState("all");

  useEffect(() => {
    sdk.actions.ready().catch(() => {
      /* ignore */
    });
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

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === "object" && err && "message" in err && typeof (err as { message?: unknown }).message === "string") {
      return (err as { message: string }).message;
    }
    return fallback;
  };

  const refreshWallet = async (client: ARTICLClient | null, addr: string | null) => {
    if (!client || !addr) return;
    try {
      const [bal, allow] = await Promise.all([client.balanceOf(addr), client.allowance(addr)]);
      setBalanceArticl(bal);
      setAllowance(allow);
    } catch (err) {
      console.error(err);
      setBalanceArticl(null);
      setAllowance(null);
    }
  };

  const connect = async () => {
    const eth = (window as { ethereum?: unknown }).ethereum;
    if (!eth) {
      setStatus({ kind: "error", message: "No wallet found (window.ethereum missing)" });
      return;
    }
    if (!tokenAddress || !marketplaceAddress) {
      setStatus({ kind: "error", message: "Set token/marketplace addresses first" });
      return;
    }
    try {
      setStatus({ kind: "loading", message: "Connecting wallet..." });
      const provider = new ethers.BrowserProvider(eth as ethers.Eip1193Provider);
      const net = await provider.getNetwork();
      if (chainId && net.chainId !== BigInt(chainId)) {
        setStatus({ kind: "error", message: `Wrong network (expected chain ${chainId})` });
        return;
      }
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      const client = new ARTICLClient({ tokenAddress, marketplaceAddress, provider }).connect(signer);
      setAccount(addr);
      setWriteClient(client);
      setStatus({ kind: "success", message: "Wallet connected" });
      await refreshWallet(client, addr);
    } catch (err) {
      setStatus({ kind: "error", message: getErrorMessage(err, "Connect failed") });
    }
  };

  const disconnect = () => {
    setAccount(null);
    setWriteClient(null);
    setBalanceArticl(null);
    setAllowance(null);
    setStatus({ kind: "success", message: "Disconnected" });
  };

  const handleMint = async () => {
    if (!writeClient || !account) return setStatus({ kind: "error", message: "Connect wallet first" });
    try {
      setStatus({ kind: "loading", message: "Minting ARTICL..." });
      const wei = ethers.parseEther(mintAmountEth || "0");
      const tx = await writeClient.mint(account, wei);
      await tx.wait();
      await refreshWallet(writeClient, account);
      setStatus({ kind: "success", message: "Minted ARTICL" });
    } catch (err) {
      setStatus({ kind: "error", message: getErrorMessage(err, "Mint failed") });
    }
  };

  const handleRedeem = async () => {
    if (!writeClient || !account) return setStatus({ kind: "error", message: "Connect wallet first" });
    try {
      setStatus({ kind: "loading", message: "Redeeming ARTICL..." });
      const tokens = parseEthToArticl(redeemAmountEth || "0");
      const tx = await writeClient.redeem(tokens, account);
      await tx.wait();
      await refreshWallet(writeClient, account);
      setStatus({ kind: "success", message: "Redeemed to ETH" });
    } catch (err) {
      setStatus({ kind: "error", message: getErrorMessage(err, "Redeem failed") });
    }
  };

  const handleApprove = async (value: string) => {
    if (!writeClient || !account) return setStatus({ kind: "error", message: "Connect wallet first" });
    try {
      setStatus({ kind: "loading", message: "Updating allowance..." });
      const tokens = value === "max" ? ethers.MaxUint256 : parseEthToArticl(value);
      const tx = await writeClient.approveMarketplace(tokens);
      await tx.wait();
      await refreshWallet(writeClient, account);
      setStatus({ kind: "success", message: "Allowance set" });
    } catch (err) {
      setStatus({ kind: "error", message: getErrorMessage(err, "Approval failed") });
    }
  };

  useEffect(() => {
    if (!tokenAddress || !marketplaceAddress) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/market-stats");
        if (!res.ok) throw new Error("Failed to fetch catalogue");
        const json = (await res.json()) as MarketData;
        if (!cancelled) setMarket(json);
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

  const heroStats = [
    { label: "APIs live", value: market?.stats.apiCount ?? "—", meta: "Catalogue" },
    { label: "Total calls", value: market?.stats.totalCalls ?? "—", meta: `${market?.stats.totalVolumeEth || "—"} ETH` },
    { label: "Minted", value: `${market?.stats.mintedEth || "—"} ETH`, meta: "ARTICL in circulation" },
    { label: "Redeemed", value: `${market?.stats.redeemedEth || "—"} ETH`, meta: "Returned to users" },
  ];

  const balanceEth = balanceArticl !== null ? formatArticlToEth(balanceArticl) : "—";
  const allowanceEthDisplay = allowance !== null ? formatArticlToEth(allowance) : "—";

  return (
    <div className="page-shell">
      <div className="grid-spine">
        <header className="nav">
          <div className="brand">
            <div className="orb" />
            <div>
              <div className="brand-name">ARTICL</div>
              <div className="brand-sub">API marketplace · Base</div>
            </div>
            <span className="chip chip-soft">onchain</span>
          </div>
          <div className="nav-actions">
            <div className="wallet-chip">
              <span className={`dot ${account ? "online" : "offline"}`} />
              <div>
                <div className="chip-label">{account ? formatAddress(account) : "Wallet"}</div>
                <small className="muted">Balance {balanceEth} ETH eq.</small>
              </div>
            </div>
            <button className="btn ghost" onClick={disconnect} disabled={!account}>
              Disconnect
            </button>
            <button className="btn" onClick={connect}>
              {account ? "Reconnect" : "Connect wallet"}
            </button>
          </div>
        </header>

        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Mint ARTICL · Approve marketplace · Sign calls</p>
            <h1>Catalogue of onchain APIs with live pricing.</h1>
            <p className="lede">
              All data comes from Alchemy (Base). Mint ARTICL with ETH, set allowance, and browse APIs by metadata. Each
              card surfaces the latest paid price (or the recommended one).
            </p>
            <div className="hero-actions">
              <span className="chip chip-soft">RPC: {rpcUrl ? "set" : "missing"}</span>
              <span className="chip chip-soft">Token: {tokenAddress ? formatAddress(tokenAddress) : "missing"}</span>
              <span className="chip chip-soft">
                Marketplace: {marketplaceAddress ? formatAddress(marketplaceAddress) : "missing"}
              </span>
            </div>
          </div>
          <div className="stat-grid hero-stats">
            {heroStats.map((stat) => (
              <div key={stat.label} className="panel stat-card">
                <p className="muted">{stat.label}</p>
                <div className="stat-value">{stat.value}</div>
                <p className="chip-subtle">{stat.meta}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel stack">
          <div className="section-heading">
            <div>
              <p className="muted">Wallet + balances</p>
              <h2>{account ? formatAddress(account) : "No wallet connected"}</h2>
            </div>
            <span className="chip chip-glow">1 ETH = {ARTICL_CONVERSION_FACTOR.toString()} ARTICL</span>
          </div>
          <div className="stat-grid">
            <div className="stat-tile">
              <p className="muted">ARTICL balance</p>
              <div className="stat-value">{balanceArticl !== null ? balanceArticl.toString() : "—"}</div>
              <p className="chip-subtle">≈ {balanceEth} ETH</p>
            </div>
            <div className="stat-tile">
              <p className="muted">Marketplace allowance</p>
              <div className="stat-value">{allowance !== null ? allowance.toString() : "—"}</div>
              <p className="chip-subtle">≈ {allowanceEthDisplay} ETH</p>
            </div>
            <div className="stat-tile">
              <p className="muted">Calls observed</p>
              <div className="stat-value">{market?.stats.totalCalls ?? "—"}</div>
              <p className="chip-subtle">From Alchemy logs</p>
            </div>
            <div className="stat-tile">
              <p className="muted">Publishers</p>
              <div className="stat-value">{market?.stats.uniquePublishers ?? "—"}</div>
              <p className="chip-subtle">Unique on Base</p>
            </div>
          </div>
        </section>

        <section className="grid-two">
          <div className="panel stack">
            <div className="section-heading">
              <div>
                <p className="muted">Flow</p>
                <h3>Mint ARTICL with ETH</h3>
              </div>
              <span className="chip chip-soft">escrowed</span>
            </div>
            <div className="form-grid">
              <label className="label" htmlFor="mint-amount">
                Amount (ETH)
              </label>
              <div className="field-row">
                <input
                  className="input"
                  id="mint-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={mintAmountEth}
                  onChange={(e) => setMintAmountEth(e.target.value)}
                />
                <button className="btn" onClick={handleMint} disabled={!account}>
                  Mint ARTICL
                </button>
              </div>
              <p className="hint">Uses token.mint(to) with msg.value; pricing pulled from your RPC (Alchemy Base).</p>
            </div>

            <div className="form-grid">
              <label className="label" htmlFor="redeem-amount">
                Redeem back to ETH (enter ETH amount)
              </label>
              <div className="field-row">
                <input
                  className="input"
                  id="redeem-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={redeemAmountEth}
                  onChange={(e) => setRedeemAmountEth(e.target.value)}
                />
                <button className="btn ghost" onClick={handleRedeem} disabled={!account}>
                  Redeem / burn
                </button>
              </div>
              <p className="hint">Converts ETH → ARTICL at 1e8; burns ARTICL and sends ETH out.</p>
            </div>
          </div>

          <div className="panel stack">
            <div className="section-heading">
              <div>
                <p className="muted">Permissions</p>
                <h3>Set or reduce allowance</h3>
              </div>
              <span className="chip chip-glow">approve</span>
            </div>
            <div className="form-grid">
              <label className="label" htmlFor="allowance-amount">
                Allowance (ETH equivalent)
              </label>
              <div className="field-row">
                <input
                  className="input"
                  id="allowance-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={allowanceEth}
                  onChange={(e) => setAllowanceEth(e.target.value)}
                />
                <button className="btn" onClick={() => void handleApprove(allowanceEth)} disabled={!account}>
                  Set allowance
                </button>
                <button className="btn ghost" onClick={() => void handleApprove("0")} disabled={!account}>
                  Reduce to 0
                </button>
              </div>
              <div className="field-row">
                <button className="btn ghost" onClick={() => void handleApprove("max")} disabled={!account}>
                  Max approve
                </button>
                <span className="chip-subtle">Approve marketplace to pull ARTICL</span>
              </div>
              <p className="hint">
                ARTICL uses 0 decimals; values here are in ETH-equivalent (converted to ARTICL with 1e8 factor).
              </p>
            </div>
          </div>
        </section>

        <section className="panel stack">
          <div className="section-heading">
            <div>
              <p className="muted">Catalogue</p>
              <h3>APIs on Base (Alchemy data)</h3>
            </div>
            <span className="chip chip-soft">filters</span>
          </div>
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

        {status.kind !== "idle" && (
          <div className={`status ${status.kind === "error" ? "error" : "ok"}`}>{status.message}</div>
        )}
        <div className="footer-note">
          Mini app ready: sdk.actions.ready() is called on load. All catalogue + prices sourced from Alchemy logs.
        </div>
      </div>
    </div>
  );
}

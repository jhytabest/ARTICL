"use client";

import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { sdk } from "@farcaster/miniapp-sdk";
import { ARTICLClient } from "@/lib/articl";

const contractAddress = process.env.NEXT_PUBLIC_ARTICL_ADDRESS || "";
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "";
const staticReadClient =
  rpcUrl && contractAddress
    ? new ARTICLClient({ contractAddress, provider: new ethers.JsonRpcProvider(rpcUrl) })
    : null;

type Status = { kind: "idle" | "loading" | "success" | "error"; message?: string };
type FeaturedCard = { name: string; category: string; price: string; uptime: string; latency: string; publisher?: string };

export default function Home() {
  const [account, setAccount] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>("-");
  const [publisherDomain, setPublisherDomain] = useState<string>("-");
  const [publisherPrice, setPublisherPrice] = useState<string>("-");
  const [publisherAddr, setPublisherAddr] = useState<string>(
    process.env.NEXT_PUBLIC_PUBLISHER_ADDRESS || ""
  );
  const [secrets, setSecrets] = useState<string[]>([]);
  const [depositAmount, setDepositAmount] = useState<string>("0.01");
  const [ticketCount, setTicketCount] = useState<number>(1);
  const [verifySecret, setVerifySecret] = useState<string>("");
  const [verifyResult, setVerifyResult] = useState<string>("-");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [purchasedTotal, setPurchasedTotal] = useState<number>(0);
  const [marketStats, setMarketStats] = useState({
    apis: "—",
    calls24h: "—",
    deposits: "—",
    totalCalls: "—",
    volume24hEth: "—",
  });
  const [featuredCards, setFeaturedCards] = useState<FeaturedCard[]>([
    { name: "PriceFeed-X", category: "DeFi", price: "0.08 USDC / 1k", uptime: "99.95%", latency: "110 ms" },
    { name: "NFT-Metadata", category: "NFT", price: "0.06 USDC / 1k", uptime: "99.90%", latency: "95 ms" },
    { name: "Signals-AI", category: "AI", price: "0.12 USDC / 1k", uptime: "99.97%", latency: "80 ms" },
  ]);

  const readClient = staticReadClient;

  const [writeClient, setWriteClient] = useState<ARTICLClient | null>(null);

  useEffect(() => {
    sdk.actions.ready().catch(() => {
      /* ignore */
    });
  }, []);

  const refreshBalances = async (client: ARTICLClient | null, addr: string | null) => {
    if (!client || !addr) return;
    try {
      const raw = await client.getClientBalance(addr);
      setBalance(ethers.formatEther(raw));
    } catch {
      setBalance("-");
    }
  };

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === "object" && err && "message" in err && typeof (err as { message?: unknown }).message === "string") {
      return (err as { message: string }).message;
    }
    return fallback;
  };

  const fetchPublisher = useCallback(
    async (client: ARTICLClient | null, addr: string) => {
      if (!client || !addr) return;
      try {
        const pub = await client.getPublisher(addr);
        setPublisherDomain(pub.domain || addr);
        setPublisherPrice(ethers.formatEther(pub.pricePerCall));
      } catch {
        setPublisherDomain("-");
        setPublisherPrice("-");
      }
    },
    []
  );

  const connect = async () => {
    const eth = (window as { ethereum?: unknown }).ethereum;
    if (!eth) {
      setStatus({ kind: "error", message: "No wallet found (window.ethereum missing)" });
      return;
    }
    if (!contractAddress) {
      setStatus({ kind: "error", message: "Set NEXT_PUBLIC_ARTICL_ADDRESS first" });
      return;
    }
    try {
      setStatus({ kind: "loading", message: "Connecting wallet..." });
      const provider = new ethers.BrowserProvider(eth as ethers.Eip1193Provider);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      const client = new ARTICLClient({ contractAddress, provider }).connect(signer);
      setAccount(addr);
      setWriteClient(client);
      setStatus({ kind: "success", message: "Wallet connected" });
      await refreshBalances(client, addr);
      await fetchPublisher(client, publisherAddr);
    } catch (err: unknown) {
      setStatus({ kind: "error", message: getErrorMessage(err, "Connect failed") });
    }
  };

  const doDeposit = async () => {
    if (!writeClient) return setStatus({ kind: "error", message: "Connect wallet first" });
    try {
      setStatus({ kind: "loading", message: "Depositing..." });
      const amt = ethers.parseEther(depositAmount || "0");
      const tx = await writeClient.deposit(amt);
      await tx.wait();
      await refreshBalances(writeClient, account);
      setStatus({ kind: "success", message: "Deposit complete" });
    } catch (err: unknown) {
      setStatus({ kind: "error", message: getErrorMessage(err, "Deposit failed") });
    }
  };

  const doBuyTickets = async () => {
    if (!writeClient) return setStatus({ kind: "error", message: "Connect wallet first" });
    if (!publisherAddr) return setStatus({ kind: "error", message: "Set publisher address" });
    try {
      setStatus({ kind: "loading", message: "Buying tickets..." });
      const result = await writeClient.buyTicketsAndGetSecrets(publisherAddr, ticketCount);
      setSecrets(result);
      setPurchasedTotal((prev) => prev + ticketCount);
      await refreshBalances(writeClient, account);
      setStatus({ kind: "success", message: "Tickets purchased" });
    } catch (err: unknown) {
      setStatus({ kind: "error", message: getErrorMessage(err, "Purchase failed") });
    }
  };

  const doVerify = async () => {
    if (!readClient || !publisherAddr) return;
    try {
      setStatus({ kind: "loading", message: "Verifying..." });
      const ok = await readClient.verifyTicketWithSecret(publisherAddr, verifySecret);
      setVerifyResult(ok ? "Valid" : "Invalid");
      setStatus({ kind: "success", message: ok ? "Ticket valid" : "Ticket invalid" });
    } catch (err: unknown) {
      setVerifyResult("-");
      setStatus({ kind: "error", message: getErrorMessage(err, "Verify failed") });
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onPublishClick = () => {
    setStatus({
      kind: "success",
      message: "Publisher flow: step through Basics → Pricing → Access → Verification (coming soon)",
    });
  };

  useEffect(() => {
    if (!contractAddress) return;
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch("/api/market-stats");
        if (!res.ok) throw new Error("Failed to fetch stats");
        const json: {
          apis: number;
          calls24h: number;
          depositsEth: string;
          totalCalls: number;
          volume24hEth: string;
          topPublishers: Array<{ publisher: string }>;
        } = await res.json();

        const hydrated =
          readClient && json.topPublishers?.length
            ? await Promise.all(
                json.topPublishers.map(async (t) => {
                  try {
                    const pub = await readClient.getPublisher(t.publisher);
                    return {
                      publisher: t.publisher,
                      name: pub.domain || t.publisher,
                      price: `${ethers.formatEther(pub.pricePerCall)} ETH / call`,
                    };
                  } catch {
                    return { publisher: t.publisher };
                  }
                })
              )
            : [];

        if (cancelled) return;

        setMarketStats({
          apis: json.apis ? json.apis.toString() : "—",
          calls24h: json.calls24h ? json.calls24h.toString() : "0",
          deposits: `${json.depositsEth} ETH`,
          totalCalls: json.totalCalls ? json.totalCalls.toString() : "0",
          volume24hEth: `${json.volume24hEth} ETH`,
        });

        if (hydrated.length) {
          setFeaturedCards(
            hydrated.map((h) => ({
              name: h.name || `${h.publisher?.slice(0, 6)}...${h.publisher?.slice(-4)}`,
              category: "On-chain",
              price: h.price || "—",
              uptime: "—",
              latency: "—",
              publisher: h.publisher,
            }))
          );
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setStatus({ kind: "error", message: "Failed to load on-chain stats. Check Basescan key/env." });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [readClient]);

  useEffect(() => {
    if (!readClient) return;
    if (!publisherAddr) return;
    void fetchPublisher(readClient, publisherAddr);
  }, [readClient, publisherAddr, fetchPublisher]);

  const heroStats = [
    { label: "APIs live", value: marketStats.apis, meta: "Marketplace inventory" },
    { label: "24h calls purchased", value: marketStats.calls24h, meta: marketStats.volume24hEth },
    { label: "Total deposits", value: marketStats.deposits, meta: "Escrowed across buyers" },
    { label: "Total calls", value: marketStats.totalCalls, meta: "Lifetime tickets" },
  ];

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
                <div className="chip-label">{account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Wallet"}</div>
                <small className="muted">Prepaid {balance === "-" ? "—" : `${balance} ETH`}</small>
              </div>
            </div>
            <button className="btn ghost" onClick={onPublishClick}>
              Publish API
            </button>
            <button className="btn" onClick={connect}>
              {account ? "Reconnect" : "Connect wallet"}
            </button>
          </div>
        </header>

        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Pay-per-call · No subscriptions · Web3 native</p>
            <h1>Minimal, futuristic marketplace for API drops.</h1>
            <p className="lede">
              Connect, deposit once, buy API calls with secrets, and verify on-chain. Publishers post offers without
              subscriptions—just prepaid liquidity.
            </p>
            <div className="hero-actions">
              <button className="btn" onClick={() => scrollToSection("purchase")}>
                Buy calls
              </button>
              <button className="btn ghost" onClick={() => scrollToSection("publish")}>
                Publish API
              </button>
              <div className="chip chip-soft">
                RPC: {rpcUrl ? "set" : "missing"} · Contract: {contractAddress ? "set" : "missing"}
              </div>
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
              <p className="muted">Connected account</p>
              <h2>{account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "No wallet connected"}</h2>
            </div>
            <span className="chip chip-glow">Marketplace ready</span>
          </div>
          <div className="stat-grid">
            <div className="stat-tile">
              <p className="muted">Prepaid balance</p>
              <div className="stat-value">{balance === "-" ? "—" : `${balance} ETH`}</div>
              <p className="chip-subtle">Held in ARTICL escrow</p>
            </div>
            <div className="stat-tile">
              <p className="muted">Calls purchased (session)</p>
              <div className="stat-value">{purchasedTotal}</div>
              <p className="chip-subtle">Latest bundle size {ticketCount}</p>
            </div>
            <div className="stat-tile">
              <p className="muted">APIs available</p>
              <div className="stat-value">{marketStats.apis}</div>
              <p className="chip-subtle">Across DeFi · NFT · AI</p>
            </div>
            <div className="stat-tile">
              <p className="muted">Verification</p>
              <div className="stat-value">{verifyResult}</div>
              <p className="chip-subtle">Ticket integrity status</p>
            </div>
          </div>
        </section>

        <section className="grid-two">
          <div className="panel stack" id="fund">
            <div className="section-heading">
              <div>
                <p className="muted">Step 1</p>
                <h3>Fund prepaid balance</h3>
              </div>
              <span className="chip chip-soft">escrowed</span>
            </div>
            <div className="form-grid">
              <label className="label">Amount (ETH)</label>
              <div className="field-row">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.001"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.05"
                />
                <button className="btn" onClick={doDeposit} disabled={!account}>
                  Deposit
                </button>
              </div>
              <p className="hint">Funds stay in-contract and power your API purchases.</p>
            </div>
            <div className="panel inset">
              <div className="mini-stat">
                <p className="muted">Wallet</p>
                <div className="mono">{account || "not connected"}</div>
              </div>
              <div className="mini-stat">
                <p className="muted">Current balance</p>
                <div className="mono">{balance === "-" ? "—" : `${balance} ETH`}</div>
              </div>
            </div>
          </div>

          <div className="panel stack" id="purchase">
            <div className="section-heading">
              <div>
                <p className="muted">Step 2</p>
                <h3>Buy API calls</h3>
              </div>
              <span className="chip chip-glow">secrets minted</span>
            </div>
            <div className="form-grid">
              <label className="label">Publisher address</label>
              <input
                className="input"
                type="text"
                value={publisherAddr}
                onChange={(e) => setPublisherAddr(e.target.value.trim())}
                placeholder="0x..."
              />
              <div className="meta-row">
                <span className="chip-subtle">Domain: {publisherDomain}</span>
                <span className="chip-subtle">
                  Price: {publisherPrice === "-" ? "—" : `${publisherPrice} ETH / call`}
                </span>
              </div>
            </div>
            <div className="form-grid">
              <label className="label">How many calls?</label>
              <div className="field-row">
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={ticketCount}
                  onChange={(e) => setTicketCount(parseInt(e.target.value, 10) || 1)}
                />
                <button className="btn" onClick={doBuyTickets} disabled={!account || !publisherAddr}>
                  Buy & mint secrets
                </button>
              </div>
              <p className="hint">Each secret is a one-time API key. Keep them private.</p>
            </div>
            {secrets.length > 0 && (
              <div className="secret-grid">
                {secrets.map((s, i) => (
                  <div key={i} className="secret-row">
                    <div className="chip chip-soft">#{i + 1}</div>
                    <code className="mono">{s}</code>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="grid-two">
          <div className="panel stack" id="verify">
            <div className="section-heading">
              <div>
                <p className="muted">Integrity</p>
                <h3>Verify a secret</h3>
              </div>
              <span className="chip chip-soft">publisher-side</span>
            </div>
            <div className="field-row">
              <input
                className="input"
                type="text"
                value={verifySecret}
                onChange={(e) => setVerifySecret(e.target.value)}
                placeholder="Paste a secret to verify"
              />
              <button className="btn ghost" onClick={doVerify} disabled={!publisherAddr}>
                Check
              </button>
            </div>
            <div className="meta-row">
              <span className="chip-subtle">Result: {verifyResult}</span>
              <span className="chip-subtle">Publisher: {publisherAddr || "—"}</span>
            </div>
            <p className="hint">Hash the secret and call verifyTicket on-chain to confirm authenticity.</p>
          </div>

          <div className="panel stack" id="publish">
            <div className="section-heading">
              <div>
                <p className="muted">For publishers</p>
                <h3>Post your API offer</h3>
              </div>
              <span className="chip chip-glow">coming soon</span>
            </div>
            <p className="lede small">
              Drop your endpoint, set price per call, connect verification, and go live to the marketplace. No
              subscriptions, just prepaid liquidity from buyers.
            </p>
            <div className="field-row">
              <button className="btn" onClick={onPublishClick}>
                Launch publish flow
              </button>
              <div className="chip-subtle">Escrow-backed payouts</div>
            </div>
            <div className="mini-grid">
              {featuredCards.map((api) => (
                <div key={`${api.name}-${api.publisher || api.category}`} className="mini-card">
                  <div className="meta-row">
                    <span className="chip chip-soft">{api.category}</span>
                    <span className="chip-subtle">Latency {api.latency}</span>
                  </div>
                  <h4>{api.name}</h4>
                  <div className="meta-row">
                    <span className="chip-subtle">{api.price}</span>
                    <span className="chip-subtle">Uptime {api.uptime}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {status.kind !== "idle" && (
          <div className={`status ${status.kind === "error" ? "error" : "ok"}`}>
            {status.message}
          </div>
        )}
        <div className="footer-note">
          Mini app ready: sdk.actions.ready() is called on load. Host /.well-known/farcaster.json with accountAssociation
          to finalize.
        </div>
      </div>
    </div>
  );
}

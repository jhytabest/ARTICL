"use client";

import { useEffect, useMemo, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useArticlWallet } from "@/lib/hooks/useArticlWallet";
import { ApiMeta, useMarketData } from "@/lib/hooks/useMarketData";

export default function PublishPage() {
  const { market, status: marketStatus } = useMarketData();
  const { account, status: walletStatus, connect, disconnect, registerApi, testMode } = useArticlWallet();
  const [apiName, setApiName] = useState("My API");
  const [apiMetadataURI, setApiMetadataURI] = useState("ipfs://metadata-hash");
  const [apiRecommendedPriceEth, setApiRecommendedPriceEth] = useState("0.001");
  const [localApis, setLocalApis] = useState<ApiMeta[]>([]);

  useEffect(() => {
    sdk.actions.ready().catch(() => {
      /* ignore */
    });
  }, []);

  const publisherApis = useMemo(() => {
    const base = market?.apis ?? [];
    if (!account) return [...base, ...localApis];
    const combined = [...base.filter((a) => a.publisher.toLowerCase() === account.toLowerCase()), ...localApis];
    return combined;
  }, [market, account, localApis]);

  const onRegister = async () => {
    const result = await registerApi({ name: apiName, metadataURI: apiMetadataURI, priceEth: apiRecommendedPriceEth });
    if (result.success) {
      const id = result.apiId || `${Date.now()}`;
      const newApi: ApiMeta = {
        apiId: id,
        name: apiName,
        publisher: account || "0x0000000000000000000000000000000000000000",
        metadataURI: apiMetadataURI,
        recommendedPriceEth: apiRecommendedPriceEth,
        lastPaidPriceEth: null,
        lastPaidAtBlock: null,
        callCount: 0,
        metadata: null,
      };
      setLocalApis((prev) => [...prev, newApi]);
    }
  };

  return (
    <div className="grid-spine">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Publishers</p>
          <h1>Register and manage API offerings.</h1>
          <p className="lede">
            Connect your wallet, publish a new API with metadata and recommended price, and view what you have listed on
            the marketplace. In test mode you can simulate without writing on-chain.
          </p>
          <div className="hero-actions">
            <span className="chip chip-soft">Register API</span>
            <span className="chip chip-soft">Update metadata</span>
            <span className="chip chip-soft">Track your listings</span>
          </div>
        </div>
        <div className="panel stat-card stack">
          <p className="muted">Wallet</p>
          <div className="wallet-chip">
            <span className={`dot ${account ? "online" : "offline"}`} />
            <div>
              <div className="chip-label">{account ? formatAddress(account) : "No wallet"}</div>
              <small className="muted">Connect to publish</small>
            </div>
          </div>
          <div className="field-row">
            <button className="btn" onClick={connect}>
              {account ? "Reconnect" : "Connect wallet"}
            </button>
            <button className="btn ghost" onClick={disconnect} disabled={!account}>
              Disconnect
            </button>
          </div>
          {testMode && <p className="hint">Test mode enabled: publishing is simulated.</p>}
        </div>
      </section>

      <section className="panel stack">
        <div className="section-heading">
          <div>
            <p className="muted">Publish</p>
            <h3>Register a new API</h3>
          </div>
          <span className="chip chip-soft">marketplace.registerApi</span>
        </div>
        <div className="form-grid">
          <label className="label" htmlFor="api-name">
            API name
          </label>
          <input id="api-name" className="input" value={apiName} onChange={(e) => setApiName(e.target.value)} />
          <label className="label" htmlFor="api-metadata">
            Metadata URI (IPFS/HTTPS)
          </label>
          <input
            id="api-metadata"
            className="input"
            value={apiMetadataURI}
            onChange={(e) => setApiMetadataURI(e.target.value)}
          />
          <label className="label" htmlFor="api-price">
            Recommended price (ETH)
          </label>
          <div className="field-row">
            <input
              id="api-price"
              className="input"
              type="number"
              min="0"
              step="0.0001"
              value={apiRecommendedPriceEth}
              onChange={(e) => setApiRecommendedPriceEth(e.target.value)}
            />
            <button className="btn" onClick={onRegister}>
              Register API
            </button>
          </div>
          <p className="hint">Writes to marketplace.registerApi; price is stored in ARTICL (1e8 precision).</p>
        </div>
      </section>

      <section className="panel stack">
        <div className="section-heading">
          <div>
            <p className="muted">Your APIs</p>
            <h3>Listings for this publisher</h3>
          </div>
          <span className="chip chip-soft">Filtered</span>
        </div>
        <div className="mini-grid">
          {publisherApis.map((api) => {
            const description =
              (api.metadata?.description as string) ||
              (api.metadata?.summary as string) ||
              (api.metadataURI ? `Metadata: ${api.metadataURI}` : "No metadata yet");
            return (
              <div key={api.apiId} className="mini-card">
                <div className="meta-row">
                  <span className="chip chip-soft">API #{api.apiId}</span>
                  <span className="chip-subtle">Recommended {api.recommendedPriceEth} ETH</span>
                </div>
                <h4>{api.name}</h4>
                <p className="muted">{description}</p>
                <div className="meta-row">
                  <span className="chip-subtle">Calls: {api.callCount}</span>
                  <span className="chip-subtle">Publisher: {formatAddress(api.publisher)}</span>
                </div>
              </div>
            );
          })}
          {!publisherApis.length && (
            <div className="mini-card">
              <div className="muted">No APIs found for this publisher yet.</div>
            </div>
          )}
        </div>
      </section>

      {(walletStatus.kind === "error" || marketStatus.kind === "error") && (
        <div className="status error">{walletStatus.message || marketStatus.message}</div>
      )}
      {walletStatus.kind !== "error" && walletStatus.message && <div className="status">{walletStatus.message}</div>}
      {testMode && <div className="footer-note">Test mode enabled: register flow is simulated.</div>}
    </div>
  );
}

const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

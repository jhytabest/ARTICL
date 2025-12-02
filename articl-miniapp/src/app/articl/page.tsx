"use client";

import { useEffect, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { useArticlWallet } from "@/lib/hooks/useArticlWallet";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "";
const tokenAddress = process.env.NEXT_PUBLIC_ATRICL_ADDRESS || "";
const marketplaceAddress = process.env.NEXT_PUBLIC_ARTICLMarketplace_ADDRESS || "";

export default function ArticlPage() {
  const { account, status, balanceArticl, allowance, connect, disconnect, handleMint, handleRedeem, handleApprove, summary, testMode } =
    useArticlWallet();
  const [mintAmountEth, setMintAmountEth] = useState("0.1");
  const [redeemAmountEth, setRedeemAmountEth] = useState("0.05");
  const [allowanceEth, setAllowanceEth] = useState("1");

  useEffect(() => {
    sdk.actions.ready().catch(() => {
      /* ignore */
    });
  }, []);

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">ARTICL token</p>
          <h1>Mint, burn, and manage allowances.</h1>
          <p className="lede">
            Connect your wallet, mint ARTICL with ETH, redeem back to ETH, and set marketplace allowance. Test mode is
            available for UI checks without a wallet.
          </p>
          <div className="hero-actions">
            <span className="chip chip-soft">RPC: {rpcUrl ? "set" : "missing"}</span>
            <span className="chip chip-soft">Token: {tokenAddress ? formatAddress(tokenAddress) : "missing"}</span>
            <span className="chip chip-soft">
              Marketplace: {marketplaceAddress ? formatAddress(marketplaceAddress) : "missing"}
            </span>
          </div>
        </div>
        <div className="panel stat-card stack">
          <p className="muted">Wallet</p>
          <div className="wallet-chip">
            <span className={`dot ${account ? "online" : "offline"}`} />
            <div>
              <div className="chip-label">{account ? formatAddress(account) : "No wallet"}</div>
              <small className="muted">Balance {summary.balanceEth} ETH eq.</small>
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
          <p className="hint">Conversion: 1 ETH = {summary.conversion} ARTICL</p>
        </div>
      </section>

      <section className="panel stack">
        <div className="section-heading">
          <div>
            <p className="muted">Balances</p>
            <h2>{account ? formatAddress(account) : "Connect to view balances"}</h2>
          </div>
          <span className="chip chip-glow">Allowance + mint/burn</span>
        </div>
        <div className="stat-grid">
          <div className="stat-tile">
            <p className="muted">ARTICL balance</p>
            <div className="stat-value">{balanceArticl !== null ? balanceArticl.toString() : "—"}</div>
            <p className="chip-subtle">≈ {summary.balanceEth} ETH</p>
          </div>
          <div className="stat-tile">
            <p className="muted">Marketplace allowance</p>
            <div className="stat-value">{allowance !== null ? allowance.toString() : "—"}</div>
            <p className="chip-subtle">≈ {summary.allowanceEth} ETH</p>
          </div>
        </div>
      </section>

      <section className="grid-two">
        <div className="panel stack">
          <div className="section-heading">
            <div>
              <p className="muted">Mint</p>
              <h3>Swap ETH → ARTICL</h3>
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
              <button className="btn" onClick={() => void handleMint(mintAmountEth)}>
                Mint ARTICL
              </button>
            </div>
            <p className="hint">Uses token.mint(to) with msg.value; pricing pulled from your RPC.</p>
          </div>
        </div>

        <div className="panel stack">
          <div className="section-heading">
            <div>
              <p className="muted">Redeem</p>
              <h3>Convert ARTICL → ETH</h3>
            </div>
            <span className="chip chip-soft">burn</span>
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
              <button className="btn ghost" onClick={() => void handleRedeem(redeemAmountEth)}>
                Redeem / burn
              </button>
            </div>
            <p className="hint">Converts ETH ↔ ARTICL at 1e8; burns ARTICL and sends ETH out.</p>
          </div>
        </div>
      </section>

      <section className="panel stack">
        <div className="section-heading">
          <div>
            <p className="muted">Permissions</p>
            <h3>Set marketplace allowance</h3>
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
            <button className="btn" onClick={() => void handleApprove(allowanceEth)}>
              Set allowance
            </button>
            <button className="btn ghost" onClick={() => void handleApprove("0")}>
              Reduce to 0
            </button>
            <button className="btn ghost" onClick={() => void handleApprove("max")}>
              Max approve
            </button>
          </div>
          <p className="hint">Values entered are ETH-equivalent and converted to ARTICL with the 1e8 factor.</p>
        </div>
      </section>

      {status.kind === "error" && <div className="status error">{status.message}</div>}
      {status.kind !== "error" && status.message && <div className="status">{status.message}</div>}
      {testMode && <div className="footer-note">Test mode enabled: actions are simulated.</div>}
    </>
  );
}

const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

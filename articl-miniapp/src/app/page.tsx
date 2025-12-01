"use client";

import { useEffect, useMemo, useState, useCallback, type CSSProperties } from "react";
import { ethers } from "ethers";
import { sdk } from "@farcaster/miniapp-sdk";
import { ARTICLClient } from "@/lib/articl";

const contractAddress = process.env.NEXT_PUBLIC_ARTICL_ADDRESS || "";
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "";

type Status = { kind: "idle" | "loading" | "success" | "error"; message?: string };

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

  const readClient = useMemo(() => {
    if (!rpcUrl || !contractAddress) return null;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    return new ARTICLClient({ contractAddress, provider });
  }, []);

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
      const message =
        typeof err === "object" && err && "message" in err
          ? // @ts-expect-error message access check
            err.message
          : "Connect failed";
      setStatus({ kind: "error", message: message as string });
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
      const message =
        typeof err === "object" && err && "message" in err
          ? // @ts-expect-error message access check
            err.message
          : "Deposit failed";
      setStatus({ kind: "error", message: message as string });
    }
  };

  const doBuyTickets = async () => {
    if (!writeClient) return setStatus({ kind: "error", message: "Connect wallet first" });
    if (!publisherAddr) return setStatus({ kind: "error", message: "Set publisher address" });
    try {
      setStatus({ kind: "loading", message: "Buying tickets..." });
      const result = await writeClient.buyTicketsAndGetSecrets(publisherAddr, ticketCount);
      setSecrets(result);
      await refreshBalances(writeClient, account);
      setStatus({ kind: "success", message: "Tickets purchased" });
    } catch (err: unknown) {
      const message =
        typeof err === "object" && err && "message" in err
          ? // @ts-expect-error message access check
            err.message
          : "Purchase failed";
      setStatus({ kind: "error", message: message as string });
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
      const message =
        typeof err === "object" && err && "message" in err
          ? // @ts-expect-error message access check
            err.message
          : "Verify failed";
      setStatus({ kind: "error", message: message as string });
    }
  };

  useEffect(() => {
    if (!readClient) return;
    if (!publisherAddr) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPublisher(readClient, publisherAddr);
  }, [readClient, publisherAddr, fetchPublisher]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.tag}>ARTICL on Base</div>
          <h1 style={styles.title}>Buy & verify API tickets</h1>
          <p style={styles.subtitle}>
            Pay-per-call access keys. Connect, deposit, buy tickets, and drop secrets into your API calls.
          </p>
        </div>
        <div style={styles.actions}>
          <button style={styles.button} onClick={connect}>
            {account ? `Connected: ${account.slice(0, 6)}...` : "Connect wallet"}
          </button>
          <div style={styles.envNote}>
            RPC: {rpcUrl ? "set" : "missing"} · Contract: {contractAddress ? "set" : "missing"}
          </div>
        </div>
      </header>

      <main style={styles.grid}>
        <section style={styles.card}>
          <h3>Publisher</h3>
          <div style={styles.formColumn}>
            <label style={styles.label}>Publisher address</label>
            <input
              style={styles.input}
              type="text"
              value={publisherAddr}
              onChange={(e) => setPublisherAddr(e.target.value.trim())}
              placeholder="0x..."
            />
          </div>
          <p>Domain: {publisherDomain}</p>
          <p>Price per call: {publisherPrice === "-" ? "-" : `${publisherPrice} ETH`}</p>
        </section>

        <section style={styles.card}>
          <h3>Your balance</h3>
          <p>Address: {account || "not connected"}</p>
          <p>Prepaid balance: {balance === "-" ? "-" : `${balance} ETH`}</p>
          <div style={styles.formRow}>
            <input
              style={styles.input}
              type="number"
              min="0"
              step="0.001"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.01"
            />
            <button style={styles.button} onClick={doDeposit} disabled={!account}>
              Deposit
            </button>
          </div>
          <small style={styles.help}>Uses `deposit` on ARTICL; funds stay in your prepaid balance.</small>
        </section>

        <section style={styles.card}>
          <h3>Buy tickets</h3>
          <div style={styles.formRow}>
            <input
              style={styles.input}
              type="number"
              min="1"
              value={ticketCount}
              onChange={(e) => setTicketCount(parseInt(e.target.value, 10) || 1)}
            />
            <button style={styles.button} onClick={doBuyTickets} disabled={!account || !publisherAddr}>
              Buy & get secrets
            </button>
          </div>
          {secrets.length > 0 && (
            <div style={styles.list}>
              {secrets.map((s, i) => (
                <div key={i} style={styles.secretRow}>
                  <span>#{i + 1}</span>
                  <code style={styles.code}>{s}</code>
                </div>
              ))}
            </div>
          )}
          <small style={styles.help}>Each secret is a one-time API key. Store securely.</small>
        </section>

        <section style={styles.card}>
          <h3>Verify a secret</h3>
          <div style={styles.formRow}>
            <input
              style={styles.input}
              type="text"
              value={verifySecret}
              onChange={(e) => setVerifySecret(e.target.value)}
              placeholder="Paste a secret to verify"
            />
            <button style={styles.button} onClick={doVerify} disabled={!publisherAddr}>
              Check
            </button>
          </div>
          <p>Result: {verifyResult}</p>
          <small style={styles.help}>Publisher flow: hash the secret and call verifyTicket.</small>
        </section>
      </main>

      <footer style={styles.footer}>
        {status.kind !== "idle" && (
          <div
            style={{
              ...styles.status,
              color: status.kind === "error" ? "#ff4d4f" : "#0f5132",
              borderColor: status.kind === "error" ? "#ff4d4f" : "#0f5132",
            }}
          >
            {status.message}
          </div>
        )}
        <div style={styles.note}>
          Mini app ready: we call sdk.actions.ready() on load. Host your manifest at /.well-known/farcaster.json and
          add accountAssociation once deployed.
        </div>
      </footer>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "32px 24px 56px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  tag: {
    display: "inline-block",
    padding: "4px 10px",
    background: "#eef2ff",
    color: "#4338ca",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 8,
  },
  title: { fontSize: 28, lineHeight: 1.2, marginBottom: 6 },
  subtitle: { color: "#555", maxWidth: 640 },
  actions: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" },
  button: {
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    fontWeight: 600,
  },
  envNote: { fontSize: 12, color: "#555" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },
  card: {
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxShadow: "0 4px 10px rgba(0,0,0,0.03)",
  },
  formRow: { display: "flex", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    fontSize: 14,
  },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  secretRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 10,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
  },
  code: { fontSize: 12, wordBreak: "break-all" },
  help: { color: "#6b7280", fontSize: 12 },
  footer: { display: "flex", flexDirection: "column", gap: 8 },
  status: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid",
    background: "#f8fafc",
    fontWeight: 600,
  },
  note: { color: "#6b7280", fontSize: 13 },
  formColumn: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, fontWeight: 600, color: "#4b5563" },
};

import { useCallback, useMemo, useState } from "react";
import { ethers } from "ethers";
import { sdk } from "@farcaster/miniapp-sdk";
import { ARTICLClient, ARTICL_CONVERSION_FACTOR } from "@/lib/articl";

const tokenAddress = process.env.NEXT_PUBLIC_ATRICL_ADDRESS || "";
const marketplaceAddress = process.env.NEXT_PUBLIC_ARTICLMarketplace_ADDRESS || "";
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "8453");
const testMode = process.env.NEXT_PUBLIC_TEST_MODE === "true";

export type WalletStatus = { kind: "idle" | "loading" | "success" | "error"; message?: string };

export function useArticlWallet() {
  const [account, setAccount] = useState<string | null>(null);
  const [writeClient, setWriteClient] = useState<ARTICLClient | null>(null);
  const [balanceArticl, setBalanceArticl] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [status, setStatus] = useState<WalletStatus>({ kind: "idle" });

  const refreshWallet = useCallback(async (client: ARTICLClient | null, addr: string | null) => {
    if (testMode) return;
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
  }, []);

  const connect = useCallback(async () => {
    if (testMode) {
      setAccount("0xTestWallet00000000000000000000000000000000");
      setWriteClient(null);
      setBalanceArticl(0n);
      setAllowance(0n);
      setStatus({ kind: "success", message: "Wallet connected (test mode)" });
      return;
    }

    const eth = await getEip1193Provider();
    if (!eth) {
      setStatus({
        kind: "error",
        message: "No wallet found. Install a Base/EVM wallet or open in the Base app.",
      });
      return;
    }
    if (!tokenAddress || !marketplaceAddress) {
      setStatus({ kind: "error", message: "Set token/marketplace addresses first" });
      return;
    }
    try {
      setStatus({ kind: "loading", message: "Connecting wallet..." });
      const provider = new ethers.BrowserProvider(eth as ethers.Eip1193Provider);
      try {
        await provider.send("eth_requestAccounts", []);
      } catch (reqErr) {
        setStatus({ kind: "error", message: getErrorMessage(reqErr, "Wallet connection was rejected") });
        return;
      }
      let net = await provider.getNetwork();
      if (chainId && net.chainId !== BigInt(chainId)) {
        const hexChainId = `0x${chainId.toString(16)}`;
        try {
          await provider.send("wallet_switchEthereumChain", [{ chainId: hexChainId }]);
          net = await provider.getNetwork();
        } catch (switchErr) {
          setStatus({ kind: "error", message: getErrorMessage(switchErr, "Switch to Base mainnet to continue") });
          return;
        }
        if (net.chainId !== BigInt(chainId)) {
          setStatus({ kind: "error", message: `Wrong network (expected chain ${chainId})` });
          return;
        }
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
  }, [refreshWallet]);

  const disconnect = useCallback(() => {
    setAccount(null);
    setWriteClient(null);
    setBalanceArticl(null);
    setAllowance(null);
    setStatus({ kind: "success", message: "Disconnected" });
  }, []);

  const handleMint = useCallback(
    async (ethAmount: string) => {
      if (!account) return setStatus({ kind: "error", message: "Connect wallet first" });
      if (!writeClient && !testMode) return setStatus({ kind: "error", message: "Wallet signer missing" });
      try {
        setStatus({ kind: "loading", message: "Minting ARTICL..." });
        if (testMode) {
          const minted = parseEthToArticl(ethAmount || "0");
          setBalanceArticl((prev) => (prev ?? 0n) + minted);
          setStatus({ kind: "success", message: "Minted ARTICL (test mode)" });
          return;
        }
        const wei = ethers.parseEther(ethAmount || "0");
        const tx = await writeClient!.mint(account, wei);
        await tx.wait();
        await refreshWallet(writeClient, account);
        setStatus({ kind: "success", message: "Minted ARTICL" });
      } catch (err) {
        setStatus({ kind: "error", message: getErrorMessage(err, "Mint failed") });
      }
    },
    [account, writeClient, refreshWallet]
  );

  const handleRedeem = useCallback(
    async (ethAmount: string) => {
      if (!account) return setStatus({ kind: "error", message: "Connect wallet first" });
      if (!writeClient && !testMode) return setStatus({ kind: "error", message: "Wallet signer missing" });
      try {
        setStatus({ kind: "loading", message: "Redeeming ARTICL..." });
        const tokens = parseEthToArticl(ethAmount || "0");
        if (testMode) {
          setBalanceArticl((prev) => {
            const current = prev ?? 0n;
            return current > tokens ? current - tokens : 0n;
          });
          setStatus({ kind: "success", message: "Redeemed to ETH (test mode)" });
          return;
        }
        const tx = await writeClient!.redeem(tokens, account);
        await tx.wait();
        await refreshWallet(writeClient, account);
        setStatus({ kind: "success", message: "Redeemed to ETH" });
      } catch (err) {
        setStatus({ kind: "error", message: getErrorMessage(err, "Redeem failed") });
      }
    },
    [account, writeClient, refreshWallet]
  );

  const handleApprove = useCallback(
    async (ethValue: string | "max") => {
      if (!account) return setStatus({ kind: "error", message: "Connect wallet first" });
      if (!writeClient && !testMode) return setStatus({ kind: "error", message: "Wallet signer missing" });
      try {
        setStatus({ kind: "loading", message: "Updating allowance..." });
        const tokens = ethValue === "max" ? ethers.MaxUint256 : parseEthToArticl(ethValue || "0");
        if (testMode) {
          setAllowance(tokens);
          setStatus({ kind: "success", message: "Allowance set (test mode)" });
          return;
        }
        const tx = await writeClient!.approveMarketplace(tokens);
        await tx.wait();
        await refreshWallet(writeClient, account);
        setStatus({ kind: "success", message: "Allowance set" });
      } catch (err) {
        setStatus({ kind: "error", message: getErrorMessage(err, "Approval failed") });
      }
    },
    [account, writeClient, refreshWallet]
  );

  const summary = useMemo(
    () => ({
      account,
      balanceEth: balanceArticl !== null ? formatArticlToEth(balanceArticl) : "—",
      allowanceEth: allowance !== null ? formatArticlToEth(allowance) : "—",
      conversion: ARTICL_CONVERSION_FACTOR.toString(),
    }),
    [account, allowance, balanceArticl]
  );

  const registerApi = useCallback(
    async ({ name, metadataURI, priceEth }: { name: string; metadataURI: string; priceEth: string }) => {
      if (!account) {
        setStatus({ kind: "error", message: "Connect wallet first" });
        return { success: false } as const;
      }
      if (!writeClient && !testMode) {
        setStatus({ kind: "error", message: "Wallet signer missing" });
        return { success: false } as const;
      }
      try {
        setStatus({ kind: "loading", message: "Registering API..." });
        const price = parseEthToArticl(priceEth || "0");
        if (testMode) {
          setStatus({ kind: "success", message: "API registered (test mode)" });
          return { success: true, apiId: crypto.randomUUID() } as const;
        }
        const tx = await writeClient!.registerApi(name, metadataURI, price);
        const receipt = await tx.wait();
        setStatus({ kind: "success", message: "API registered" });
        return { success: true, apiId: receipt?.hash || undefined } as const;
      } catch (err) {
        setStatus({ kind: "error", message: getErrorMessage(err, "Registration failed") });
        return { success: false } as const;
      }
    },
    [account, writeClient]
  );

  return {
    account,
    status,
    balanceArticl,
    allowance,
    connect,
    disconnect,
    handleMint,
    handleRedeem,
    handleApprove,
    registerApi,
    refreshWallet,
    summary,
    testMode,
  };
}

const getEip1193Provider = async (): Promise<ethers.Eip1193Provider | null> => {
  if (typeof window === "undefined") return null;
  try {
    const miniappProvider = await sdk.wallet.getEthereumProvider();
    if (miniappProvider) return miniappProvider as ethers.Eip1193Provider;
  } catch (err) {
    console.warn("Miniapp wallet provider unavailable", err);
  }
  const injected = (window as { ethereum?: unknown }).ethereum;
  return injected ? (injected as ethers.Eip1193Provider) : null;
};

const formatArticlToEth = (value: bigint) => ethers.formatUnits(value, 8);
const parseEthToArticl = (value: string) => ethers.parseUnits(value || "0", 8);

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return fallback;
};

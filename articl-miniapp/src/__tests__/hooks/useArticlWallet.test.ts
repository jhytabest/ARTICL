import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock the Farcaster SDK before importing the hook
vi.mock("@farcaster/miniapp-sdk", () => ({
  sdk: {
    wallet: {
      getEthereumProvider: vi.fn().mockResolvedValue(null),
    },
  },
}));

// Mock ethers
const mockMint = vi.fn();
const mockRedeem = vi.fn();
const mockApprove = vi.fn();
const mockBalanceOf = vi.fn();
const mockAllowance = vi.fn();
const mockRegisterApi = vi.fn();
const mockConnect = vi.fn();
const mockGetSigner = vi.fn();
const mockSend = vi.fn();
const mockGetNetwork = vi.fn();
const mockGetAddress = vi.fn();
const mockWait = vi.fn();

vi.mock("ethers", async () => {
  const actual = await vi.importActual("ethers");
  return {
    ...actual,
    BrowserProvider: vi.fn().mockImplementation(() => ({
      send: mockSend,
      getSigner: mockGetSigner,
      getNetwork: mockGetNetwork,
    })),
    parseEther: (actual as typeof import("ethers")).parseEther,
    parseUnits: (actual as typeof import("ethers")).parseUnits,
    formatUnits: (actual as typeof import("ethers")).formatUnits,
    MaxUint256: (actual as typeof import("ethers")).MaxUint256,
  };
});

// Mock ARTICLClient
vi.mock("@/lib/articl", () => ({
  ARTICLClient: vi.fn().mockImplementation(() => ({
    mint: mockMint,
    redeem: mockRedeem,
    approveMarketplace: mockApprove,
    balanceOf: mockBalanceOf,
    allowance: mockAllowance,
    registerApi: mockRegisterApi,
    connect: mockConnect.mockReturnThis(),
  })),
  ARTICL_CONVERSION_FACTOR: 100_000_000n,
}));

// Reset env to non-test mode
vi.stubEnv("NEXT_PUBLIC_TEST_MODE", "false");
vi.stubEnv("NEXT_PUBLIC_ATRICL_ADDRESS", "0x1234567890123456789012345678901234567890");
vi.stubEnv("NEXT_PUBLIC_ARTICLMarketplace_ADDRESS", "0x0987654321098765432109876543210987654321");
vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "8453");

describe("useArticlWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMint.mockResolvedValue({ wait: mockWait.mockResolvedValue({}) });
    mockRedeem.mockResolvedValue({ wait: mockWait.mockResolvedValue({}) });
    mockApprove.mockResolvedValue({ wait: mockWait.mockResolvedValue({}) });
    mockRegisterApi.mockResolvedValue({ wait: mockWait.mockResolvedValue({ hash: "0xabc" }) });
    mockBalanceOf.mockResolvedValue(50_000_000n);
    mockAllowance.mockResolvedValue(100_000_000n);
    mockGetAddress.mockResolvedValue("0xUserAddress123456789012345678901234567890");
    mockGetNetwork.mockResolvedValue({ chainId: 8453n });
    mockGetSigner.mockResolvedValue({
      getAddress: mockGetAddress,
    });
    mockSend.mockResolvedValue(["0xUserAddress123456789012345678901234567890"]);
  });

  it("should start with idle status and no account", async () => {
    // Dynamic import to get fresh module state
    const { useArticlWallet } = await import("@/lib/hooks/useArticlWallet");
    const { result } = renderHook(() => useArticlWallet());

    expect(result.current.status.kind).toBe("idle");
    expect(result.current.account).toBeNull();
    expect(result.current.balanceArticl).toBeNull();
    expect(result.current.allowance).toBeNull();
  });

  it("should show error when connecting without wallet", async () => {
    const { useArticlWallet } = await import("@/lib/hooks/useArticlWallet");
    const { result } = renderHook(() => useArticlWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status.kind).toBe("error");
    expect(result.current.status.message).toContain("No wallet found");
  });

  it("should disconnect and clear state", async () => {
    const { useArticlWallet } = await import("@/lib/hooks/useArticlWallet");
    const { result } = renderHook(() => useArticlWallet());

    await act(async () => {
      result.current.disconnect();
    });

    expect(result.current.account).toBeNull();
    expect(result.current.balanceArticl).toBeNull();
    expect(result.current.allowance).toBeNull();
    expect(result.current.status.kind).toBe("success");
    expect(result.current.status.message).toBe("Disconnected");
  });

  it("should require connection before minting", async () => {
    const { useArticlWallet } = await import("@/lib/hooks/useArticlWallet");
    const { result } = renderHook(() => useArticlWallet());

    await act(async () => {
      await result.current.handleMint("1.0");
    });

    expect(result.current.status.kind).toBe("error");
    expect(result.current.status.message).toContain("Connect wallet first");
  });

  it("should require connection before redeeming", async () => {
    const { useArticlWallet } = await import("@/lib/hooks/useArticlWallet");
    const { result } = renderHook(() => useArticlWallet());

    await act(async () => {
      await result.current.handleRedeem("0.5");
    });

    expect(result.current.status.kind).toBe("error");
    expect(result.current.status.message).toContain("Connect wallet first");
  });

  it("should require connection before approving", async () => {
    const { useArticlWallet } = await import("@/lib/hooks/useArticlWallet");
    const { result } = renderHook(() => useArticlWallet());

    await act(async () => {
      await result.current.handleApprove("10");
    });

    expect(result.current.status.kind).toBe("error");
    expect(result.current.status.message).toContain("Connect wallet first");
  });

  it("should provide formatted summary values", async () => {
    const { useArticlWallet } = await import("@/lib/hooks/useArticlWallet");
    const { result } = renderHook(() => useArticlWallet());

    // Without connection, summary shows dashes
    expect(result.current.summary.account).toBeNull();
    expect(result.current.summary.balanceEth).toBe("—");
    expect(result.current.summary.allowanceEth).toBe("—");
    expect(result.current.summary.conversion).toBe("100000000");
  });

  it("should require connection for registerApi", async () => {
    const { useArticlWallet } = await import("@/lib/hooks/useArticlWallet");
    const { result } = renderHook(() => useArticlWallet());

    let apiResult: { success: boolean };
    await act(async () => {
      apiResult = await result.current.registerApi({
        name: "Test API",
        metadataURI: "https://example.com/meta.json",
        priceEth: "0.001",
      });
    });

    expect(apiResult!.success).toBe(false);
    expect(result.current.status.kind).toBe("error");
    expect(result.current.status.message).toContain("Connect wallet first");
  });
});

describe("useArticlWallet - test mode", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_TEST_MODE", "true");
  });

  it("should connect in test mode without real wallet", async () => {
    // Clear module cache to pick up new env
    vi.resetModules();
    
    // Re-mock dependencies for fresh import
    vi.doMock("@farcaster/miniapp-sdk", () => ({
      sdk: { wallet: { getEthereumProvider: vi.fn().mockResolvedValue(null) } },
    }));
    vi.doMock("@/lib/articl", () => ({
      ARTICLClient: vi.fn(),
      ARTICL_CONVERSION_FACTOR: 100_000_000n,
    }));

    const { useArticlWallet } = await import("@/lib/hooks/useArticlWallet");
    const { result } = renderHook(() => useArticlWallet());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.account).toBe("0xTestWallet00000000000000000000000000000000");
    expect(result.current.status.kind).toBe("success");
    expect(result.current.status.message).toContain("test mode");
  });
});

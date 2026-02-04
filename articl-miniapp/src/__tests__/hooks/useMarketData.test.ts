import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Set test mode to get mock data without fetch
vi.stubEnv("NEXT_PUBLIC_TEST_MODE", "true");
vi.stubEnv("NEXT_PUBLIC_ATRICL_ADDRESS", "0x1234567890123456789012345678901234567890");
vi.stubEnv("NEXT_PUBLIC_ARTICLMarketplace_ADDRESS", "0x0987654321098765432109876543210987654321");

describe("useMarketData", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should return mock data in test mode", async () => {
    const { useMarketData } = await import("@/lib/hooks/useMarketData");
    const { result } = renderHook(() => useMarketData());

    // In test mode, it should have mock data immediately
    expect(result.current.market).not.toBeNull();
    expect(result.current.status.kind).toBe("success");
  });

  it("should have stats in mock data", async () => {
    const { useMarketData } = await import("@/lib/hooks/useMarketData");
    const { result } = renderHook(() => useMarketData());

    expect(result.current.market?.stats).toBeDefined();
    expect(result.current.market?.stats.apiCount).toBeGreaterThanOrEqual(0);
  });

  it("should have apis array in mock data", async () => {
    const { useMarketData } = await import("@/lib/hooks/useMarketData");
    const { result } = renderHook(() => useMarketData());

    expect(result.current.market?.apis).toBeDefined();
    expect(Array.isArray(result.current.market?.apis)).toBe(true);
  });

  it("should derive categories from API metadata", async () => {
    const { useMarketData } = await import("@/lib/hooks/useMarketData");
    const { result } = renderHook(() => useMarketData());

    expect(result.current.categories).toContain("all");
    expect(Array.isArray(result.current.categories)).toBe(true);
  });

  it("should derive tags from API metadata", async () => {
    const { useMarketData } = await import("@/lib/hooks/useMarketData");
    const { result } = renderHook(() => useMarketData());

    expect(result.current.tags).toContain("all");
    expect(Array.isArray(result.current.tags)).toBe(true);
  });
});

import { vi } from "vitest";

// Mock environment variables
vi.stubEnv("NEXT_PUBLIC_ATRICL_ADDRESS", "0x1234567890123456789012345678901234567890");
vi.stubEnv("NEXT_PUBLIC_ARTICLMarketplace_ADDRESS", "0x0987654321098765432109876543210987654321");
vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "8453");
vi.stubEnv("NEXT_PUBLIC_RPC_URL", "https://mainnet.base.org");
vi.stubEnv("NEXT_PUBLIC_TEST_MODE", "false");

// Mock window.crypto
Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: () => "test-uuid-1234",
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  },
});

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

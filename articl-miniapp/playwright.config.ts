import type { PlaywrightTestConfig } from "@playwright/test";

const port = process.env.PORT || 3000;

const config: PlaywrightTestConfig = {
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  webServer: {
    command: `npm run dev -- --hostname 0.0.0.0 --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_TOKEN_ADDRESS: process.env.NEXT_PUBLIC_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000",
      NEXT_PUBLIC_MARKETPLACE_ADDRESS:
        process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS || "0x0000000000000000000000000000000000000000",
      NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || "",
      NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID || "8453",
      NEXT_PUBLIC_SCAN_FROM_BLOCK: process.env.NEXT_PUBLIC_SCAN_FROM_BLOCK || "0",
      ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY || "",
      NEXT_PUBLIC_TEST_MODE: "true",
    },
  },
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
  },
};

export default config;

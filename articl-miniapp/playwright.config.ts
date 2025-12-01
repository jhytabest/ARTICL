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
      NEXT_PUBLIC_ARTICL_ADDRESS: process.env.NEXT_PUBLIC_ARTICL_ADDRESS || "0x58Da8f333587FD921b6055c868a9da495302751D",
      NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || "",
    },
  },
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
  },
};

export default config;

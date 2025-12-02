import { test, expect } from "@playwright/test";

const marketMock = {
  stats: {
    apiCount: 2,
    uniquePublishers: 2,
    totalCalls: 12,
    totalVolumeEth: "0.4",
    mintedEth: "8",
    redeemedEth: "1",
  },
  apis: [
    {
      apiId: "1",
      name: "Weather feed",
      publisher: "0xabc0000000000000000000000000000000000abc",
      metadataURI: "https://example.com/weather.json",
      recommendedPriceEth: "0.0015",
      lastPaidPriceEth: "0.002",
      lastPaidAtBlock: 123,
      callCount: 4,
      metadata: { category: "data", description: "Realtime weather", tags: ["weather", "data"] },
    },
    {
      apiId: "2",
      name: "Gas oracle",
      publisher: "0xdef0000000000000000000000000000000000def",
      metadataURI: "https://example.com/gas.json",
      recommendedPriceEth: "0.0005",
      lastPaidPriceEth: null,
      lastPaidAtBlock: null,
      callCount: 2,
      metadata: { category: "infra", description: "Base gas data", tags: ["gas", "infra"] },
    },
  ],
};

test.describe("ARTICL miniapp smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/market-stats", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(marketMock) });
    });
  });

  test("renders marketplace stats and hero copy", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Catalogue of onchain APIs on Base.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Catalogue" })).toBeVisible();
    await expect(page.getByText("APIs live")).toBeVisible();
    await expect(page.getByText("2").first()).toBeVisible();
    await expect(page.getByText("Total calls")).toBeVisible();
    await expect(page.locator(".stat-card", { hasText: "Total calls" })).toContainText("12");
    await expect(page.locator(".stat-card", { hasText: "Minted" })).toContainText("8 ETH");
    await expect(page.locator(".stat-card", { hasText: "Redeemed" })).toContainText("1 ETH");

    await expect(page.getByText("Weather feed")).toBeVisible();
    await expect(page.getByText("Gas oracle")).toBeVisible();
  });

  test("wallet flows work in test mode (mint, allowance, redeem, register)", async ({ page }) => {
    await page.goto("/articl");

    await page.getByRole("button", { name: /connect wallet/i }).click();
    await expect(page.getByText(/wallet connected \(test mode\)/i)).toBeVisible();

    await page.getByLabel("Amount (ETH)").fill("0.2");
    await page.getByRole("button", { name: /mint articl/i }).click();
    await expect(page.getByText(/minted articl \(test mode\)/i)).toBeVisible();

    await page.getByLabel("Allowance (ETH equivalent)").fill("0.5");
    await page.getByRole("button", { name: /set allowance/i }).click();
    await expect(page.getByText(/allowance set \(test mode\)/i)).toBeVisible();

    await page.getByLabel("Redeem back to ETH (enter ETH amount)").fill("0.05");
    await page.getByRole("button", { name: /redeem/i }).click();
    await expect(page.getByText(/redeemed to eth \(test mode\)/i)).toBeVisible();

    await page.goto("/publish");
    await page.getByRole("button", { name: /connect wallet/i }).click();
    await expect(page.getByText(/wallet connected \(test mode\)/i)).toBeVisible();
    await page.getByLabel("API name").fill("Demo API");
    await page.getByLabel("Metadata URI (IPFS/HTTPS)").fill("https://example.com/demo.json");
    await page.getByLabel("Recommended price (ETH)").fill("0.0009");
    await page.getByRole("button", { name: /register api/i }).click();
    await expect(page.getByText(/api registered \(test mode\)/i)).toBeVisible();
    await expect(page.locator(".mini-card")).toContainText("Demo API");
  });
});

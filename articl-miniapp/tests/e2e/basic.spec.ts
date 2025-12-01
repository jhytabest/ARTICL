import { test, expect } from "@playwright/test";

test.describe("ARTICL miniapp smoke", () => {
  test("renders marketplace stats and hero copy", async ({ page }) => {
    // Mock Basescan-backed stats to avoid external calls.
    await page.route("**/api/market-stats", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          apis: 3,
          calls24h: 15,
          depositsEth: "10",
          totalCalls: 90,
          volume24hEth: "1.5",
          topPublishers: [{ publisher: "0xabc0000000000000000000000000000000000abc" }],
        }),
      });
    });

    await page.goto("/");

    await expect(page.getByText("Minimal, futuristic marketplace for API drops.")).toBeVisible();
    await expect(page.getByText("APIs live")).toBeVisible();
    await expect(page.getByText("3").first()).toBeVisible();
    await expect(page.getByText("24h calls purchased")).toBeVisible();
    await expect(page.getByText("15")).toBeVisible();
    await expect(page.getByText("Total deposits")).toBeVisible();
    await expect(page.getByText("10 ETH")).toBeVisible();

    // Featured cards should render (from mocked data or defaults).
    await expect(page.getByText("Post your API offer")).toBeVisible();
  });
});

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
          publishers: [
            "0xabc0000000000000000000000000000000000abc",
            "0xdef0000000000000000000000000000000000def",
          ],
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

  test("buyer can select API, connect (test mode), deposit, buy, and verify", async ({ page }) => {
    await page.route("**/api/market-stats", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          apis: 2,
          calls24h: 5,
          depositsEth: "2.5",
          totalCalls: 20,
          volume24hEth: "0.5",
          topPublishers: [{ publisher: "0xabc0000000000000000000000000000000000abc" }],
          publishers: [
            "0xabc0000000000000000000000000000000000abc",
            "0xdef0000000000000000000000000000000000def",
          ],
        }),
      });
    });

    await page.goto("/");

    // Connect wallet (test mode) and see status.
    await page.getByRole("button", { name: /connect wallet/i }).click();
    await expect(page.getByText(/wallet connected/i)).toBeVisible();

    // Select the second API card.
    const apiCards = page.locator(".mini-card.selectable");
    await expect(apiCards).toHaveCount(2);
    await apiCards.nth(1).click();

    // Deposit flow.
    const depositInput = page.getByLabel("Amount (ETH)");
    await depositInput.fill("0.05");
    await page.getByRole("button", { name: /deposit/i }).click();
    await expect(page.getByText(/deposit complete \(test mode\)/i)).toBeVisible();

    // Buy tickets flow.
    const quantityInput = page.getByLabel("How many calls?");
    await quantityInput.fill("2");
    await page.getByRole("button", { name: /buy & mint secrets/i }).click();
    await expect(page.getByText(/tickets purchased \(test mode\)/i)).toBeVisible();
    await expect(page.locator(".secret-row")).toHaveCount(2);

    // Verify flow.
    await page.getByPlaceholder("Paste a secret to verify").fill("mock-secret-1");
    await page.getByRole("button", { name: /check/i }).click();
    await expect(page.getByText(/ticket valid \(test mode\)/i)).toBeVisible();
    await expect(page.getByText(/Result: Valid/)).toBeVisible();
  });
});

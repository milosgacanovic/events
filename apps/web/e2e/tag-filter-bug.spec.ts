import { test, expect } from "@playwright/test";

test("filtering events by tag=ceremony returns results", async ({ page }) => {
  await page.goto("/events?tags=ceremony");
  await page.waitForTimeout(3000);

  const pageContent = await page.content();
  const hasNoResults =
    pageContent.includes("No results") ||
    pageContent.includes("no results") ||
    pageContent.includes("0 events");

  expect(hasNoResults).toBe(false);
});

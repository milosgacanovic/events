import { expect, test } from "@playwright/test";

const BASE = "https://events.danceresource.org";

test.describe("hosts mobile full-width", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14

  test("cards panel is full viewport width on mobile", async ({ page }) => {
    await page.goto(`${BASE}/hosts?practice=open-floor`);
    const panel = page.locator(".panel.cards");
    await expect(panel).toBeVisible({ timeout: 15000 });

    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    // Panel should span the full 390px viewport (allow 2px tolerance for borders)
    expect(box!.width).toBeGreaterThanOrEqual(388);
    // Panel should start at or before x=1
    expect(box!.x).toBeLessThanOrEqual(1);
  });

  test("map view is full viewport width on mobile", async ({ page }) => {
    await page.goto(`${BASE}/hosts?practice=open-floor&view=map`);
    const map = page.locator(".leaflet-map");
    await expect(map).toBeVisible({ timeout: 15000 });

    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    // Map should span the full 390px viewport
    expect(box!.width).toBeGreaterThanOrEqual(388);
    expect(box!.x).toBeLessThanOrEqual(1);
  });
});

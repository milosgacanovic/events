import { expect, test, type Page, type Route } from "@playwright/test";

const BASE = "http://localhost:13000";

// Fulfill Nominatim reverse-geocode with a fixed city + country
function mockNominatim(page: Page, city: string, countryCode: string) {
  return page.route("https://nominatim.openstreetmap.org/**", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ address: { city, country_code: countryCode } }),
    }),
  );
}

// Intercept probe requests (pageSize=1):
//   - /api/events/search  → return `eventsHits` so useGeolocation transitions to "ready"
//   - /api/organizers/search → city probe returns cityCount, country probe returns countryCount
// Main search requests (pageSize=20) pass through to the real API.
async function mockGeoProbes(
  page: Page,
  { eventsHits, cityCount, countryCount }: { eventsHits: number; cityCount: number; countryCount: number },
) {
  await page.route("**/api/events/search*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("pageSize") !== "1") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], totalHits: eventsHits }),
    });
  });

  await page.route("**/api/organizers/search*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("pageSize") !== "1") return route.continue();
    const count = url.searchParams.get("city") ? cityCount : countryCount;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: count }),
    });
  });
}

test.describe("hosts geo pill", () => {
  test("shows city pill with count when city has hosts", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 44.8176, longitude: 20.4569 }); // Belgrade
    await mockNominatim(page, "Belgrade", "rs");
    await mockGeoProbes(page, { eventsHits: 10, cityCount: 14, countryCount: 40 });

    await page.goto(`${BASE}/hosts`);
    await expect(page.locator(".hero-pill-geo")).toBeVisible({ timeout: 10000 });
    await page.locator(".hero-pill-geo").click();

    const pill = page.locator(".hero-pill-geo");
    await expect(pill).toContainText("Belgrade", { timeout: 15000 });
    await expect(pill).toContainText("14");
    // Should not show country fallback
    expect(await pill.textContent()).not.toMatch(/Serbia/i);
  });

  test("falls back to country pill when city has 0 hosts", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 45.267, longitude: 19.833 }); // Novi Sad coords
    await mockNominatim(page, "Novi Sad", "rs");
    // City has 0 hosts, country has 23
    await mockGeoProbes(page, { eventsHits: 10, cityCount: 0, countryCount: 23 });

    await page.goto(`${BASE}/hosts`);
    await expect(page.locator(".hero-pill-geo")).toBeVisible({ timeout: 10000 });
    await page.locator(".hero-pill-geo").click();

    const pill = page.locator(".hero-pill-geo");
    // Should show country-level pill
    await expect(pill).toContainText("Serbia", { timeout: 15000 });
    await expect(pill).toContainText("23");
    expect(await pill.textContent()).not.toMatch(/Novi Sad/i);
  });

  test("shows 'no hosts nearby' when both city and country have 0 hosts", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 44.8176, longitude: 20.4569 });
    await mockNominatim(page, "Somewhere", "xx");
    // Both city and country have 0 hosts; events also return 0 (geo → no_events OR ready+0)
    await mockGeoProbes(page, { eventsHits: 5, cityCount: 0, countryCount: 0 });

    await page.goto(`${BASE}/hosts`);
    await expect(page.locator(".hero-pill-geo")).toBeVisible({ timeout: 10000 });
    await page.locator(".hero-pill-geo").click();

    const pill = page.locator(".hero-pill-geo");
    await expect(pill).not.toHaveText(/detecting/i, { timeout: 15000 });
    const text = (await pill.textContent()) ?? "";
    expect(text.toLowerCase()).toMatch(/no hosts|nearby/i);
  });

  test("clicking 'Near you' auto-applies city filter and pill becomes active", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 44.8176, longitude: 20.4569 });
    await mockNominatim(page, "Belgrade", "rs");
    await mockGeoProbes(page, { eventsHits: 10, cityCount: 8, countryCount: 30 });

    await page.goto(`${BASE}/hosts`);
    await expect(page.locator(".hero-pill-geo")).toBeVisible({ timeout: 10000 });

    // Clicking "Near you" should auto-apply the city filter once geo resolves
    await page.locator(".hero-pill-geo").click();

    // Filter applied automatically — URL should contain city filter
    await expect(page).toHaveURL(/city=Belgrade/, { timeout: 15000 });

    // The pill should be active and show the count
    const pill = page.locator(".hero-pill-geo");
    await expect(pill).toHaveClass(/hero-pill-active/, { timeout: 5000 });
    await expect(pill).toContainText("8");
  });
});

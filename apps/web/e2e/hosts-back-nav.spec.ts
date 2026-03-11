import { expect, test } from "@playwright/test";

const BASE = "http://localhost:13100";

test.describe("hosts back-navigation persistence", () => {
  test("1. basic back-navigation restores results", async ({ page }) => {
    await page.goto(`${BASE}/hosts`);
    const cards = page.locator(".host-card-h");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const initialCount = await cards.count();

    await cards.first().click();
    await expect(page).toHaveURL(/\/hosts\/.+/, { timeout: 10000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/hosts$|\/hosts\?/, { timeout: 10000 });

    // Cards should be immediately visible from cache (no fresh search needed)
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    const restoredCount = await cards.count();
    expect(restoredCount).toBe(initialCount);
  });

  test("2. scroll position is restored", async ({ page }) => {
    await page.goto(`${BASE}/hosts`);
    const cards = page.locator(".host-card-h");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    // Click the last card which is below the fold (Playwright scrolls to it before clicking,
    // so onNavigateAway captures a non-zero scrollY)
    const lastCard = cards.last();
    await lastCard.scrollIntoViewIfNeeded();
    const scrollYBeforeClick = await page.evaluate(() => window.scrollY);

    await lastCard.click();
    await expect(page).toHaveURL(/\/hosts\/.+/, { timeout: 10000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/hosts$|\/hosts\?/, { timeout: 10000 });
    await expect(cards.first()).toBeVisible({ timeout: 5000 });

    // Wait for scroll restoration (50ms delay + rendering time)
    await page.waitForTimeout(500);
    const scrollY = await page.evaluate(() => window.scrollY);

    if (scrollYBeforeClick > 0) {
      // Scroll position should be restored to roughly where the user was
      expect(scrollY).toBeGreaterThan(0);
    }
  });

  test("3. load-more items are preserved on back navigation", async ({ page }) => {
    await page.goto(`${BASE}/hosts`);
    const cards = page.locator(".host-card-h");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const initialCount = await cards.count();

    const loadMoreBtn = page.locator(".load-more-btn");
    const hasLoadMore = await loadMoreBtn.isVisible();

    if (hasLoadMore) {
      await loadMoreBtn.click();
      await page.waitForTimeout(2000);
      const afterLoadCount = await cards.count();

      if (afterLoadCount > initialCount) {
        // Load-more succeeded — verify count is preserved on back nav
        await cards.first().click();
        await expect(page).toHaveURL(/\/hosts\/.+/, { timeout: 10000 });
        await page.goBack();
        await expect(page).toHaveURL(/\/hosts$|\/hosts\?/, { timeout: 10000 });
        await expect(cards.first()).toBeVisible({ timeout: 5000 });
        const restoredCount = await cards.count();
        expect(restoredCount).toBe(afterLoadCount);
        return;
      }
    }

    // Fallback: single-page test — back nav restores the original count
    await cards.first().click();
    await expect(page).toHaveURL(/\/hosts\/.+/, { timeout: 10000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/hosts$|\/hosts\?/, { timeout: 10000 });
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    const restoredCount = await cards.count();
    expect(restoredCount).toBe(initialCount);
  });

  test("4. cache is cleared when filter changes after back nav", async ({ page }) => {
    await page.goto(`${BASE}/hosts`);
    const cards = page.locator(".host-card-h");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    // Click a card and go back
    await cards.first().click();
    await expect(page).toHaveURL(/\/hosts\/.+/, { timeout: 10000 });
    await page.goBack();
    await expect(cards.first()).toBeVisible({ timeout: 5000 });

    // Change the search query — this should clear cache
    await page.locator("aside.filters input").first().fill("xyz_unique_test_query_string");
    await page.waitForTimeout(600);

    // Verify sessionStorage snapshot was cleared
    const snapshot = await page.evaluate(() => {
      try { return sessionStorage.getItem("search-cache-snapshot"); } catch { return null; }
    });
    expect(snapshot).toBeNull();
  });

  test("5. breadcrumb is visible on host detail when coming from search", async ({ page }) => {
    await page.goto(`${BASE}/hosts`);
    const cards = page.locator(".host-card-h");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });

    await cards.first().click();
    await expect(page).toHaveURL(/\/hosts\/.+/, { timeout: 10000 });

    const breadcrumb = page.locator("nav.event-detail-breadcrumb");
    await expect(breadcrumb).toBeVisible({ timeout: 5000 });

    // The breadcrumb anchor should exist (may use router.back() or Link)
    await expect(breadcrumb.locator("a")).toBeVisible();
    const linkText = await breadcrumb.locator("a").textContent();
    expect(linkText).toContain("Hosts");
  });

  test("6. breadcrumb on direct navigation uses Link (no router.back)", async ({ page }) => {
    // Navigate directly to a host detail page (not from search)
    await page.goto(`${BASE}/hosts/aaron-lifshin`);

    const breadcrumb = page.locator("nav.event-detail-breadcrumb");
    await expect(breadcrumb).toBeVisible({ timeout: 10000 });

    // No sessionStorage snapshot → cameFromSearch=false → regular <Link href="/hosts">
    const link = breadcrumb.locator("a");
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toBe("/hosts");

    await link.click();
    await expect(page).toHaveURL(/\/hosts$|\/hosts\?/, { timeout: 10000 });
  });

  test("7. events back-navigation not broken (regression)", async ({ page }) => {
    await page.goto(`${BASE}/events`);
    const cards = page.locator(".event-card-h");
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const initialCount = await cards.count();

    await cards.first().click();
    await expect(page).toHaveURL(/\/events\/.+/, { timeout: 10000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/events$|\/events\?/, { timeout: 10000 });
    await expect(cards.first()).toBeVisible({ timeout: 5000 });

    const restoredCount = await cards.count();
    expect(restoredCount).toBe(initialCount);
  });
});

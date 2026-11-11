import { test, expect, type BrowserContextOptions } from "@playwright/test";

/**
 * Hydration regression test (handoff fix-hydration-and-404, 2026-11-11).
 *
 * Loads several page types under timezone/locale combinations that differ
 * from the server's and fails on any React hydration error (#418/#423/#425).
 * Event URLs come from the live sitemap so the test doesn't rot as events
 * expire.
 *
 * The "stored preference" variants matter: the original bug only fired for
 * visitors who had once picked "Your time" (localStorage), so a plain
 * timezone/locale override does not reproduce it.
 *
 *   BASE_URL=https://events.danceresource.org npx playwright test apps/web/e2e/hydration.spec.ts
 */

const BASE = (process.env.BASE_URL ?? "https://events.danceresource.org").replace(/\/$/, "");
const FIXED_PATHS = [
  "/events",
  "/events/in/gb/london",
  "/series/saturday-noon-rome",
  "/hosts/christian-de-sousa",
];
const HYDRATION = /Minified React error #(418|423|425)|Hydration failed|did not match|hydrat/i;

type Variant = {
  name: string;
  context: BrowserContextOptions;
  /** "Your time" saved in localStorage before the page loads. */
  storedUserTime?: boolean;
  /** dr_locale cookie, as set by the locale switcher. */
  localeCookie?: string;
};

const VARIANTS: Variant[] = [
  { name: "Europe/Belgrade sr-Latn-RS", context: { timezoneId: "Europe/Belgrade", locale: "sr-Latn-RS" } },
  { name: "Asia/Tokyo de-DE", context: { timezoneId: "Asia/Tokyo", locale: "de-DE" } },
  { name: "America/Los_Angeles en-US", context: { timezoneId: "America/Los_Angeles", locale: "en-US" } },
  {
    name: "Europe/Belgrade + stored 'Your time'",
    context: { timezoneId: "Europe/Belgrade", locale: "sr-Latn-RS" },
    storedUserTime: true,
  },
  {
    name: "Asia/Tokyo + stored 'Your time' + dr_locale=de",
    context: { timezoneId: "Asia/Tokyo", locale: "de-DE" },
    storedUserTime: true,
    localeCookie: "de",
  },
];

for (const variant of VARIANTS) {
  test(`no hydration errors (${variant.name})`, async ({ browser, request }) => {
    test.setTimeout(180_000);
    const xml = await (await request.get(`${BASE}/sitemap-events-1.xml`)).text();
    const eventPaths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .slice(0, 4)
      .map((m) => new URL(m[1]).pathname);
    expect(eventPaths.length, "sitemap-events-1.xml returned no event URLs").toBeGreaterThan(0);

    const context = await browser.newContext(variant.context);
    if (variant.storedUserTime) {
      await context.addInitScript(() => {
        try {
          window.localStorage.setItem("dr-events-time-display-mode", "user");
        } catch {
          // storage blocked: nothing to set
        }
      });
    }
    if (variant.localeCookie) {
      await context.addCookies([{ name: "dr_locale", value: variant.localeCookie, url: BASE }]);
    }

    const failures: string[] = [];
    for (const path of [...FIXED_PATHS, ...eventPaths]) {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(BASE + path, { waitUntil: "load" });
      await page.waitForTimeout(2000); // let hydration finish
      const bad = errors.filter((e) => HYDRATION.test(e));
      if (bad.length) failures.push(`${path}: ${bad.length} hydration error(s), first: ${bad[0].slice(0, 120)}`);
      await page.close();
    }

    await context.close();
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

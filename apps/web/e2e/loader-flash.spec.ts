import { test, expect } from '@playwright/test';

test('no loading overlay on fresh /events load', async ({ page }) => {
  const overlayShown: number[] = [];
  const start = Date.now();

  page.on('domcontentloaded', () => console.log('DOMContentLoaded at', Date.now() - start));

  await page.goto('https://events.danceresource.org/events');

  // Set up mutation observer to catch any overlay appearance
  await page.evaluate(() => {
    (window as any).__overlayCount = 0;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if ((node as Element).classList?.contains('cards-loading-overlay')) {
            (window as any).__overlayCount++;
            console.log('OVERLAY ADDED at', Date.now());
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    (window as any).__observer = observer;
  });

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const count = await page.evaluate(() => (window as any).__overlayCount);
  const overlayNow = await page.locator('.cards-loading-overlay').count();

  console.log('Overlay appeared', count, 'times during load');
  console.log('Overlay present after idle:', overlayNow);

  expect(count, 'overlay should not appear on initial load').toBe(0);
  expect(overlayNow, 'overlay should not be visible after load').toBe(0);
});

test('no loading overlay on fresh /hosts load', async ({ page }) => {
  await page.goto('https://events.danceresource.org/hosts');

  await page.evaluate(() => {
    (window as any).__overlayCount = 0;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if ((node as Element).classList?.contains('cards-loading-overlay')) {
            (window as any).__overlayCount++;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    (window as any).__observer = observer;
  });

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const count = await page.evaluate(() => (window as any).__overlayCount);
  const overlayNow = await page.locator('.cards-loading-overlay').count();

  console.log('Overlay appeared', count, 'times during /hosts load');
  expect(count, 'overlay should not appear on initial load').toBe(0);
  expect(overlayNow, 'overlay should not be visible after load').toBe(0);
});

import { afterEach, describe, expect, it } from "vitest";

import {
  WRITE_RATE_LIMIT_MAX,
  WRITE_RATE_LIMIT_WINDOW_MS,
  checkRateLimit,
  checkWriteRateLimit,
  resetRateLimitBuckets,
  resolveAdminRateLimit,
  resolvePublicRateLimit,
} from "./rateLimit";

afterEach(() => {
  resetRateLimitBuckets();
});

describe("checkRateLimit (pure sliding-window logic)", () => {
  it("allows the first maxRequests hits then denies", () => {
    const args = { key: "k1", windowMs: 60_000, maxRequests: 3 };
    expect(checkRateLimit({ ...args, now: 1000 }).allowed).toBe(true);
    expect(checkRateLimit({ ...args, now: 1100 }).allowed).toBe(true);
    expect(checkRateLimit({ ...args, now: 1200 }).allowed).toBe(true);
    const denied = checkRateLimit({ ...args, now: 1300 });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("evicts hits older than windowMs so later calls succeed", () => {
    const args = { key: "k-evict", windowMs: 60_000, maxRequests: 2 };
    checkRateLimit({ ...args, now: 0 });
    checkRateLimit({ ...args, now: 100 });
    expect(checkRateLimit({ ...args, now: 200 }).allowed).toBe(false);
    // Jump past the window relative to the oldest hit (0).
    expect(checkRateLimit({ ...args, now: 60_001 }).allowed).toBe(true);
  });

  it("computes retryAfterSeconds from the oldest hit + windowMs", () => {
    const args = { key: "k-retry", windowMs: 60_000, maxRequests: 1 };
    checkRateLimit({ ...args, now: 10_000 });
    const denied = checkRateLimit({ ...args, now: 15_000 });
    // oldest=10_000, window=60_000, now=15_000 -> retryAfterMs=55_000 -> 55s.
    expect(denied.retryAfterSeconds).toBe(55);
  });

  it("retryAfterSeconds is never negative", () => {
    const args = { key: "k-neg", windowMs: 60_000, maxRequests: 1 };
    checkRateLimit({ ...args, now: 10_000 });
    const denied = checkRateLimit({ ...args, now: 9_000 });
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(0);
  });

  it("keeps buckets isolated per key", () => {
    const common = { windowMs: 60_000, maxRequests: 1, now: 500 };
    expect(checkRateLimit({ ...common, key: "a" }).allowed).toBe(true);
    expect(checkRateLimit({ ...common, key: "b" }).allowed).toBe(true);
    expect(checkRateLimit({ ...common, key: "a" }).allowed).toBe(false);
  });

  it("resetRateLimitBuckets clears all state", () => {
    const args = { key: "reset", windowMs: 60_000, maxRequests: 1 };
    checkRateLimit({ ...args, now: 0 });
    expect(checkRateLimit({ ...args, now: 1 }).allowed).toBe(false);
    resetRateLimitBuckets();
    expect(checkRateLimit({ ...args, now: 2 }).allowed).toBe(true);
  });
});

describe("resolveAdminRateLimit", () => {
  it("returns 300 for any /api/admin/* path", () => {
    expect(resolveAdminRateLimit("/api/admin/events")).toBe(300);
    expect(resolveAdminRateLimit("/api/admin/logs/errors")).toBe(300);
  });

  it("returns null for non-admin paths", () => {
    expect(resolveAdminRateLimit("/api/events/search")).toBeNull();
    expect(resolveAdminRateLimit("/admin/events")).toBeNull(); // missing /api prefix
    expect(resolveAdminRateLimit("/")).toBeNull();
  });
});

describe("resolvePublicRateLimit", () => {
  it("returns override limits for known public routes", () => {
    expect(resolvePublicRateLimit("/api/events/search", 60)).toBe(300);
    expect(resolvePublicRateLimit("/api/organizers/search", 60)).toBe(240);
    expect(resolvePublicRateLimit("/api/map/clusters", 60)).toBe(240);
    expect(resolvePublicRateLimit("/api/map/organizer-clusters", 60)).toBe(240);
    expect(resolvePublicRateLimit("/api/meta/countries", 60)).toBe(300);
  });

  it("returns null for unknown paths", () => {
    expect(resolvePublicRateLimit("/api/events/abc", 60)).toBeNull();
    expect(resolvePublicRateLimit("/api/health", 60)).toBeNull();
  });
});

describe("checkWriteRateLimit", () => {
  it("uses WRITE_RATE_LIMIT_MAX as the default cap", () => {
    for (let i = 0; i < WRITE_RATE_LIMIT_MAX; i += 1) {
      expect(checkWriteRateLimit("user-1", "publish").allowed).toBe(true);
    }
    expect(checkWriteRateLimit("user-1", "publish").allowed).toBe(false);
  });

  it("respects maxOverride", () => {
    expect(checkWriteRateLimit("user-2", "bulk", 1).allowed).toBe(true);
    expect(checkWriteRateLimit("user-2", "bulk", 1).allowed).toBe(false);
  });

  it("keeps separate buckets per (subject, operation)", () => {
    expect(checkWriteRateLimit("user-a", "publish", 1).allowed).toBe(true);
    // Same op, different subject
    expect(checkWriteRateLimit("user-b", "publish", 1).allowed).toBe(true);
    // Same subject, different op
    expect(checkWriteRateLimit("user-a", "cancel", 1).allowed).toBe(true);
    // Exhausted subject+op
    expect(checkWriteRateLimit("user-a", "publish", 1).allowed).toBe(false);
  });

  it("exposes the configured window constant", () => {
    expect(WRITE_RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });
});

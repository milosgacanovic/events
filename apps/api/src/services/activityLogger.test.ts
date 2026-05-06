import { describe, expect, it, vi, beforeEach } from "vitest";

import { recordActivity, sanitizeBody } from "./activityLogger";
import * as repo from "../db/activityLogRepo";

vi.mock("../db/activityLogRepo", () => ({
  logActivity: vi.fn(() => Promise.resolve()),
}));

describe("sanitizeBody", () => {
  it("returns null for non-object input", () => {
    expect(sanitizeBody(null)).toBeNull();
    expect(sanitizeBody(undefined)).toBeNull();
    expect(sanitizeBody("hi")).toBeNull();
    expect(sanitizeBody(42)).toBeNull();
    expect(sanitizeBody(true)).toBeNull();
  });

  it("redacts password field case-insensitively", () => {
    expect(sanitizeBody({ password: "s3cret" })).toEqual({ password: "[REDACTED]" });
    expect(sanitizeBody({ PASSWORD: "x" })).toEqual({ PASSWORD: "[REDACTED]" });
    expect(sanitizeBody({ userPassword: "x" })).toEqual({ userPassword: "[REDACTED]" });
  });

  it("redacts token, secret, authorization, cookie, apiKey, api_key variants", () => {
    const result = sanitizeBody({
      token: "a",
      refreshToken: "b",
      clientSecret: "c",
      authorization: "Bearer xyz",
      cookie: "sid=abc",
      apiKey: "k1",
      api_key: "k2",
      "api-key": "k3",
    });
    expect(result).toEqual({
      token: "[REDACTED]",
      refreshToken: "[REDACTED]",
      clientSecret: "[REDACTED]",
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      apiKey: "[REDACTED]",
      api_key: "[REDACTED]",
      "api-key": "[REDACTED]",
    });
  });

  it("redacts sensitive keys recursively inside nested objects", () => {
    const result = sanitizeBody({
      user: { name: "Ana", password: "x" },
      meta: { nested: { token: "t" } },
    });
    expect(result).toEqual({
      user: { name: "Ana", password: "[REDACTED]" },
      meta: { nested: { token: "[REDACTED]" } },
    });
  });

  it("redacts sensitive keys inside arrays of objects", () => {
    const result = sanitizeBody({
      credentials: [{ password: "a" }, { password: "b" }],
    });
    expect(result).toEqual({
      credentials: [{ password: "[REDACTED]" }, { password: "[REDACTED]" }],
    });
  });

  it("leaves non-sensitive fields untouched", () => {
    const body = { id: 1, name: "Ana", nested: { email: "a@b.co" } };
    expect(sanitizeBody(body)).toEqual(body);
  });

  it("does not mutate the input", () => {
    const input = { password: "x", name: "Ana" };
    const snapshot = { ...input };
    sanitizeBody(input);
    expect(input).toEqual(snapshot);
  });
});

describe("recordActivity snapshot gate", () => {
  const logActivityMock = vi.mocked(repo.logActivity);

  // Minimal pool stub: actor lookup returns no row so we don't hit any DB.
  const pool = {
    query: vi.fn(() => Promise.resolve({ rows: [] })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  function makeRequest(preferredUsername: string | null) {
    return {
      auth: preferredUsername
        ? { sub: "kc-sub", preferredUsername, email: null }
        : null,
      ip: "127.0.0.1",
      headers: { "user-agent": "vitest" },
      log: { error: vi.fn() },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  beforeEach(() => {
    logActivityMock.mockClear();
    logActivityMock.mockResolvedValue(undefined);
  });

  it("replaces snapshot with placeholder for service-account edits", async () => {
    const fullSnapshot = { id: "evt-1", title: "Original", description: "x".repeat(1000) };
    await recordActivity(pool, makeRequest("service-account-dr-events-importer"), {
      action: "event.edit",
      targetType: "event",
      targetId: "evt-1",
      snapshot: fullSnapshot,
    });

    // logActivity is fire-and-forget; await microtask flush.
    await new Promise((r) => setImmediate(r));

    expect(logActivityMock).toHaveBeenCalledTimes(1);
    const passed = logActivityMock.mock.calls[0]?.[1];
    expect(passed?.snapshot).toEqual({
      _omitted: "Snapshot omitted for service account — see source table for current state",
    });
  });

  it("passes snapshot through unchanged for human actors", async () => {
    const fullSnapshot = { id: "evt-2", title: "Edited by user" };
    await recordActivity(pool, makeRequest("milos_makonda"), {
      action: "event.edit",
      targetType: "event",
      targetId: "evt-2",
      snapshot: fullSnapshot,
    });

    await new Promise((r) => setImmediate(r));

    const passed = logActivityMock.mock.calls[0]?.[1];
    expect(passed?.snapshot).toEqual(fullSnapshot);
  });

  it("passes snapshot through for service-account deletes (forensic record)", async () => {
    const fullSnapshot = { id: "evt-3", title: "About to be deleted" };
    await recordActivity(pool, makeRequest("service-account-dr-events-importer"), {
      action: "event.delete",
      targetType: "event",
      targetId: "evt-3",
      snapshot: fullSnapshot,
    });

    await new Promise((r) => setImmediate(r));

    const passed = logActivityMock.mock.calls[0]?.[1];
    expect(passed?.snapshot).toEqual(fullSnapshot);
  });
});

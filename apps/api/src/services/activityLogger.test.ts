import { describe, expect, it } from "vitest";

import { sanitizeBody } from "./activityLogger";

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

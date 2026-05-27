import { describe, expect, it } from "vitest";

import { safeErrorBody } from "./errorResponse";

describe("safeErrorBody", () => {
  it("masks 5xx messages so internal/DB detail never reaches the client", () => {
    // The exact pg leak this guards against (organizers/search null byte).
    expect(safeErrorBody(500, 'invalid byte sequence for encoding "UTF8": 0x00')).toEqual({
      error: "internal_error",
    });
    expect(safeErrorBody(500, "Connection terminated unexpectedly")).toEqual({ error: "internal_error" });
    expect(safeErrorBody(503, "anything")).toEqual({ error: "internal_error" });
  });

  it("preserves sub-500 messages (validation, auth) for the client", () => {
    expect(safeErrorBody(400, "validation_failed")).toEqual({ error: "validation_failed" });
    expect(safeErrorBody(400, "invalid_uuid_list")).toEqual({ error: "invalid_uuid_list" });
    expect(safeErrorBody(401, "invalid_token")).toEqual({ error: "invalid_token" });
    expect(safeErrorBody(404, "not_found")).toEqual({ error: "not_found" });
  });

  it("falls back to internal_error when a sub-500 message is empty", () => {
    expect(safeErrorBody(400, "")).toEqual({ error: "internal_error" });
  });
});

import { describe, expect, it, vi } from "vitest";

import { getEventsExternalRefSchemaStatus } from "./startupChecks";

describe("startup external ref schema diagnostics", () => {
  it("reports all required schema objects when present", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [
          { column_name: "external_source" },
          { column_name: "external_id" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ exists: true }],
      });
    const pool = { query } as never;

    const status = await getEventsExternalRefSchemaStatus(pool);

    expect(status).toEqual({
      externalSourceColumnExists: true,
      externalIdColumnExists: true,
      externalRefUniqueIndexExists: true,
    });
  });

  it("reports missing objects accurately", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ column_name: "external_source" }],
      })
      .mockResolvedValueOnce({
        rows: [{ exists: false }],
      });
    const pool = { query } as never;

    const status = await getEventsExternalRefSchemaStatus(pool);

    expect(status).toEqual({
      externalSourceColumnExists: true,
      externalIdColumnExists: false,
      externalRefUniqueIndexExists: false,
    });
  });
});

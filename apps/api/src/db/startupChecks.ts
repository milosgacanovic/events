import type { Pool } from "pg";

const REQUIRED_EVENT_COLUMNS = ["external_source", "external_id"] as const;

export async function assertEventsExternalRefColumns(pool: Pool): Promise<void> {
  const result = await pool.query<{ column_name: string }>(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'events'
        and column_name = any($1::text[])
    `,
    [REQUIRED_EVENT_COLUMNS],
  );

  const found = new Set(result.rows.map((row) => row.column_name));
  const missing = REQUIRED_EVENT_COLUMNS.filter((column) => !found.has(column));

  if (missing.length) {
    throw new Error(
      `startup_schema_check_failed: missing events columns [${missing.join(", ")}]. ` +
      "Run migrations with `npm run migrate -w @dr-events/api` and ensure migration `003_event_external_ref.sql` is applied.",
    );
  }
}

import type { Pool } from "pg";

const REQUIRED_EVENT_COLUMNS = ["external_source", "external_id"] as const;
const REQUIRED_EXTERNAL_REF_INDEX = "events_external_source_external_id_unique_idx";

export type ExternalRefSchemaStatus = {
  externalSourceColumnExists: boolean;
  externalIdColumnExists: boolean;
  externalRefUniqueIndexExists: boolean;
};

export async function getEventsExternalRefSchemaStatus(pool: Pool): Promise<ExternalRefSchemaStatus> {
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
  const indexResult = await pool.query<{ exists: boolean }>(
    `
      select to_regclass($1) is not null as exists
    `,
    [`public.${REQUIRED_EXTERNAL_REF_INDEX}`],
  );

  return {
    externalSourceColumnExists: found.has("external_source"),
    externalIdColumnExists: found.has("external_id"),
    externalRefUniqueIndexExists: indexResult.rows[0]?.exists ?? false,
  };
}

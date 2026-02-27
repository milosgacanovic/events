import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://dr_events:dr_events_password@localhost:15432/dr_events";

async function countQuery(client: Client, sql: string): Promise<number> {
  const result = await client.query<{ count: string }>(sql);
  return Number(result.rows[0]?.count ?? "0");
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const nullEventFormat = await countQuery(
      client,
      "select count(*)::text as count from events where event_format_id is null",
    );
    const importedWithoutSource = await countQuery(
      client,
      "select count(*)::text as count from events where is_imported = true and import_source is null",
    );
    const externalIdWithoutImportedFlag = await countQuery(
      client,
      "select count(*)::text as count from events where is_imported = false and external_id is not null",
    );

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          integrity_audit_summary: {
            null_event_format: nullEventFormat,
            imported_without_source: importedWithoutSource,
            external_id_without_imported_flag: externalIdWithoutImportedFlag,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

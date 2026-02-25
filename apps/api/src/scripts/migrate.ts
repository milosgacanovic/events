import fs from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

import { config } from "../config";

async function main() {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const migrationsDir = path.resolve(process.cwd(), "../../db/migrations");
    const files = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();

    for (const file of files) {
      const alreadyApplied = await client.query<{ filename: string }>(
        "select filename from schema_migrations where filename = $1",
        [file],
      );

      if (alreadyApplied.rowCount) {
        continue;
      }

      const migrationSql = await fs.readFile(path.join(migrationsDir, file), "utf-8");
      await client.query("begin");
      await client.query(migrationSql);
      await client.query("insert into schema_migrations (filename) values ($1)", [file]);
      await client.query("commit");
      // eslint-disable-next-line no-console
      console.log(`Applied migration: ${file}`);
    }
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

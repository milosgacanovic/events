import fs from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";

import { config } from "../config";

async function main() {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const seedPath = path.resolve(process.cwd(), "../../db/seed/seed.sql");
  const sql = await fs.readFile(seedPath, "utf-8");

  try {
    await pool.query(sql);
    // eslint-disable-next-line no-console
    console.log("Seed completed");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

import type { Pool } from "pg";

export async function getGeocodeCache(
  pool: Pool,
  provider: string,
  query: string,
): Promise<unknown[] | null> {
  const result = await pool.query<{ response: unknown[] }>(
    `
      select response
      from geocode_cache
      where provider = $1 and query = $2
      limit 1
    `,
    [provider, query],
  );

  return result.rows[0]?.response ?? null;
}

export async function upsertGeocodeCache(
  pool: Pool,
  provider: string,
  query: string,
  response: unknown[],
): Promise<void> {
  await pool.query(
    `
      insert into geocode_cache (provider, query, response)
      values ($1, $2, $3)
      on conflict (provider, query)
      do update set response = excluded.response, created_at = now()
    `,
    [provider, query, JSON.stringify(response)],
  );
}

import type { Pool } from "pg";

export async function findOrCreateUserBySub(pool: Pool, keycloakSub: string): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `
      insert into users (keycloak_sub)
      values ($1)
      on conflict (keycloak_sub) do update set keycloak_sub = excluded.keycloak_sub
      returning id
    `,
    [keycloakSub],
  );

  return inserted.rows[0].id;
}

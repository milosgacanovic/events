import type { Pool } from "pg";

export async function findOrCreateUserBySub(
  pool: Pool,
  keycloakSub: string,
  displayName?: string,
  email?: string,
): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `
      insert into users (keycloak_sub, display_name, email)
      values ($1, $2, $3)
      on conflict (keycloak_sub) do update set
        display_name = coalesce(nullif(excluded.display_name, ''), users.display_name),
        email = coalesce(nullif(excluded.email, ''), users.email)
      returning id
    `,
    [keycloakSub, displayName ?? null, email ?? null],
  );

  return inserted.rows[0].id;
}

export type UserProfileRow = {
  id: string;
  keycloak_sub: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
};

export async function getUserProfileBySub(pool: Pool, keycloakSub: string): Promise<UserProfileRow> {
  const result = await pool.query<UserProfileRow>(
    `
      insert into users (keycloak_sub)
      values ($1)
      on conflict (keycloak_sub) do update set keycloak_sub = excluded.keycloak_sub
      returning id, keycloak_sub, display_name, email, created_at
    `,
    [keycloakSub],
  );

  return result.rows[0];
}

export async function updateUserProfileBySub(
  pool: Pool,
  keycloakSub: string,
  input: {
    displayName?: string | null;
    email?: string | null;
  },
): Promise<UserProfileRow> {
  const result = await pool.query<UserProfileRow>(
    `
      insert into users (keycloak_sub, display_name, email)
      values ($1, $2, $3)
      on conflict (keycloak_sub)
      do update set
        display_name = coalesce(excluded.display_name, users.display_name),
        email = coalesce(excluded.email, users.email)
      returning id, keycloak_sub, display_name, email, created_at
    `,
    [keycloakSub, input.displayName ?? null, input.email ?? null],
  );

  return result.rows[0];
}

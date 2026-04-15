import type { Pool } from "pg";

export async function findOrCreateUserBySub(
  pool: Pool,
  keycloakSub: string,
  displayName?: string,
  email?: string,
  roles?: string[],
): Promise<string> {
  const inserted = await pool.query<{ id: string }>(
    `
      insert into users (keycloak_sub, display_name, email, roles)
      values ($1, $2, $3, $4)
      on conflict (keycloak_sub) do update set
        display_name = coalesce(nullif(excluded.display_name, ''), users.display_name),
        email = coalesce(nullif(excluded.email, ''), users.email),
        roles = case when cardinality(excluded.roles) = 0 then users.roles else excluded.roles end
      returning id
    `,
    [keycloakSub, displayName ?? null, email ?? null, roles ?? []],
  );

  return inserted.rows[0].id;
}

export type UserProfileRow = {
  id: string;
  keycloak_sub: string;
  display_name: string | null;
  email: string | null;
  home_country_code: string | null;
  home_city: string | null;
  home_lat: string | null;
  home_lng: string | null;
  home_location_label: string | null;
  default_radius_km: number | null;
  created_at: string;
};

const PROFILE_COLUMNS = `
  id,
  keycloak_sub,
  display_name,
  email,
  home_country_code,
  home_city,
  home_lat,
  home_lng,
  home_location_label,
  default_radius_km,
  created_at
`;

export async function getUserProfileBySub(pool: Pool, keycloakSub: string): Promise<UserProfileRow> {
  const result = await pool.query<UserProfileRow>(
    `
      insert into users (keycloak_sub)
      values ($1)
      on conflict (keycloak_sub) do update set keycloak_sub = excluded.keycloak_sub
      returning ${PROFILE_COLUMNS}
    `,
    [keycloakSub],
  );

  return result.rows[0];
}

export async function isServiceAccount(pool: Pool, keycloakSub: string): Promise<boolean> {
  const result = await pool.query<{ is_service_account: boolean }>(
    `SELECT is_service_account FROM users WHERE keycloak_sub = $1`,
    [keycloakSub],
  );
  return result.rows[0]?.is_service_account ?? false;
}

export type UpdateUserProfileInput = {
  displayName?: string | null;
  email?: string | null;
  homeCountryCode?: string | null;
  homeCity?: string | null;
  homeLat?: number | null;
  homeLng?: number | null;
  homeLocationLabel?: string | null;
  defaultRadiusKm?: number | null;
};

export async function updateUserProfileBySub(
  pool: Pool,
  keycloakSub: string,
  input: UpdateUserProfileInput,
): Promise<UserProfileRow> {
  // Each column written only when the caller opted in (value !== undefined).
  // `null` is a legal "clear this field" value; `undefined` leaves it alone.
  const sets: string[] = [];
  const values: unknown[] = [keycloakSub];
  function addSet(column: string, value: unknown) {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  if (input.displayName !== undefined) addSet("display_name", input.displayName);
  if (input.email !== undefined) addSet("email", input.email);
  if (input.homeCountryCode !== undefined) {
    addSet("home_country_code", input.homeCountryCode?.toLowerCase() ?? null);
  }
  if (input.homeCity !== undefined) addSet("home_city", input.homeCity);
  if (input.homeLat !== undefined) addSet("home_lat", input.homeLat);
  if (input.homeLng !== undefined) addSet("home_lng", input.homeLng);
  if (input.homeLocationLabel !== undefined) addSet("home_location_label", input.homeLocationLabel);
  if (input.defaultRadiusKm !== undefined) addSet("default_radius_km", input.defaultRadiusKm);

  if (sets.length === 0) {
    // Nothing to update — just return current row (ensures user exists).
    return getUserProfileBySub(pool, keycloakSub);
  }

  const result = await pool.query<UserProfileRow>(
    `
      update users
      set ${sets.join(", ")}
      where keycloak_sub = $1
      returning ${PROFILE_COLUMNS}
    `,
    values,
  );
  if (result.rows[0]) return result.rows[0];

  // User didn't exist yet — create + apply.
  await pool.query(
    `insert into users (keycloak_sub) values ($1) on conflict do nothing`,
    [keycloakSub],
  );
  const retry = await pool.query<UserProfileRow>(
    `
      update users
      set ${sets.join(", ")}
      where keycloak_sub = $1
      returning ${PROFILE_COLUMNS}
    `,
    values,
  );
  return retry.rows[0];
}

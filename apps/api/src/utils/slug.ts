import slugify from "slugify";
import type { Pool } from "pg";

const slugBase = (value: string) =>
  slugify(value, {
    lower: true,
    strict: true,
    trim: true,
  }).slice(0, 90);

const RANDOM_SUFFIX_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const randomSuffix = (length: number) => {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += RANDOM_SUFFIX_ALPHABET[Math.floor(Math.random() * RANDOM_SUFFIX_ALPHABET.length)];
  }
  return out;
};

export async function generateUniqueSlug(
  pool: Pool,
  table: "events" | "organizers",
  sourceValue: string,
  currentId?: string,
): Promise<string> {
  const base = slugBase(sourceValue) || "item";

  const isFree = async (candidate: string): Promise<boolean> => {
    const result = await pool.query<{ exists: boolean }>(
      currentId
        ? `select exists(select 1 from ${table} where slug = $1 and id <> $2) as exists`
        : `select exists(select 1 from ${table} where slug = $1) as exists`,
      currentId ? [candidate, currentId] : [candidate],
    );
    return !result.rows[0]?.exists;
  };

  // Sequential probe for pretty slugs in the common low-collision case.
  if (await isFree(base)) return base;
  for (let i = 2; i <= 10; i += 1) {
    const candidate = `${base}-${i}`;
    if (await isFree(candidate)) return candidate;
  }

  // Heavy-collision fallback: a random suffix keeps the endpoint O(1) even for
  // titles like "Emerging Waves" that hundreds of hosts share.
  for (let i = 0; i < 20; i += 1) {
    const candidate = `${base}-${randomSuffix(6)}`;
    if (await isFree(candidate)) return candidate;
  }

  throw new Error(`Could not generate unique slug for ${table}`);
}

const SLUG_UNIQUE_CONSTRAINTS = {
  events: "events_slug_key",
  organizers: "organizers_slug_key",
} as const;

/**
 * True when a Postgres error is the slug uniqueness violation for `table`.
 *
 * Callers that accept a client-supplied slug bypass `generateUniqueSlug`, so
 * the collision only surfaces at insert/update time as 23505. Detecting it
 * lets routes answer 409 instead of leaking a bare 500.
 */
export function isSlugUniqueViolation(
  error: unknown,
  table: keyof typeof SLUG_UNIQUE_CONSTRAINTS,
): boolean {
  const value = error as { code?: string; constraint?: string; message?: string } | undefined;
  if (!value || value.code !== "23505") {
    return false;
  }

  const constraint = SLUG_UNIQUE_CONSTRAINTS[table];
  return value.constraint === constraint || Boolean(value.message?.includes(constraint));
}

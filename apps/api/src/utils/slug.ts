import slugify from "slugify";
import type { Pool } from "pg";

const slugBase = (value: string) =>
  slugify(value, {
    lower: true,
    strict: true,
    trim: true,
  }).slice(0, 90);

const nextCandidate = (base: string, iteration: number) =>
  iteration === 1 ? base : `${base}-${iteration}`;

export async function generateUniqueSlug(
  pool: Pool,
  table: "events" | "organizers",
  sourceValue: string,
  currentId?: string,
): Promise<string> {
  const base = slugBase(sourceValue) || "item";

  for (let i = 1; i < 2000; i += 1) {
    const candidate = nextCandidate(base, i);
    const result = await pool.query<{ exists: boolean }>(
      currentId
        ? `select exists(select 1 from ${table} where slug = $1 and id <> $2) as exists`
        : `select exists(select 1 from ${table} where slug = $1) as exists`,
      currentId ? [candidate, currentId] : [candidate],
    );

    if (!result.rows[0]?.exists) {
      return candidate;
    }
  }

  throw new Error(`Could not generate unique slug for ${table}`);
}

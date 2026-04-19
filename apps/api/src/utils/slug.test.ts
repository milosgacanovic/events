import { describe, expect, it, vi } from "vitest";

import { generateUniqueSlug } from "./slug";

type Row = { exists: boolean };

function makePool(predicate: (slug: string, currentId: string | undefined) => boolean) {
  const query = vi.fn(async (_sql: string, params: unknown[]) => {
    const [slug, currentId] = params as [string, string | undefined];
    return { rows: [{ exists: predicate(slug, currentId) }] as Row[] };
  });
  return { pool: { query } as never, query };
}

describe("generateUniqueSlug", () => {
  it("returns the base slug when it is unique", async () => {
    const { pool, query } = makePool(() => false);
    const slug = await generateUniqueSlug(pool, "events", "Hello World");
    expect(slug).toBe("hello-world");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("appends -2, -3, ... on collisions until a free slug is found", async () => {
    const taken = new Set(["hello", "hello-2", "hello-3"]);
    const { pool } = makePool((slug) => taken.has(slug));
    const slug = await generateUniqueSlug(pool, "events", "hello");
    expect(slug).toBe("hello-4");
  });

  it("falls back to 'item' when the input slugifies to empty", async () => {
    const { pool } = makePool(() => false);
    const slug = await generateUniqueSlug(pool, "events", "!!!");
    expect(slug).toBe("item");
  });

  it("truncates the base slug to 90 characters", async () => {
    const { pool } = makePool(() => false);
    const long = "a".repeat(200);
    const slug = await generateUniqueSlug(pool, "events", long);
    expect(slug.length).toBe(90);
    expect(slug).toBe("a".repeat(90));
  });

  it("excludes the current row when checking for collisions", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [{ exists: false }] };
      }),
    } as never;

    await generateUniqueSlug(pool, "events", "Hello", "id-1");
    expect(calls[0].sql).toContain("id <> $2");
    expect(calls[0].params).toEqual(["hello", "id-1"]);
  });

  it("lowercases, strips punctuation, and replaces spaces with hyphens", async () => {
    const { pool } = makePool(() => false);
    expect(await generateUniqueSlug(pool, "events", "Héllo, World!")).toBe("hello-world");
  });

  it("works for the organizers table", async () => {
    const captured: string[] = [];
    const pool = {
      query: vi.fn(async (sql: string, _params: unknown[]) => {
        captured.push(sql);
        return { rows: [{ exists: false }] };
      }),
    } as never;

    await generateUniqueSlug(pool, "organizers", "My Studio");
    expect(captured[0]).toContain("from organizers");
  });
});

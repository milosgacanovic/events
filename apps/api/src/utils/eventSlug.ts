import slugify from "slugify";

/**
 * Slugs for NEW events (SEO round 3, Task 7). Existing slugs never change here.
 *
 * Preference order (first free candidate wins):
 *   1. title + city                       emerging-waves-den-haag
 *   2. title + city + organizer surname   emerging-waves-den-haag-freitas
 *   3. (2) + numeric suffix               emerging-waves-den-haag-freitas-2   (last resort)
 *
 * Non-Latin titles are transliterated (any-ascii) before slugifying, so a
 * Hebrew or Cyrillic title no longer collapses to "item". When the title is a
 * placeholder ("TBD") or transliterates to nothing usable, the slug is built
 * from city + organizer instead. Nothing ever produces "item-NNN".
 */

const MAX_SLUG_LENGTH = 90;
const MAX_TITLE_PART_LENGTH = 60;

const PLACEHOLDER_TITLE_SLUGS = new Set([
  "tbd", "tba", "tbc", "to-be-announced", "to-be-determined", "to-be-confirmed",
  "untitled", "untitled-event", "no-title", "event", "new-event", "test", "test-event",
  "n-a", "na", "none", "null", "undefined", "item",
]);

// Path words a future /events/<word>/… route may need (e.g. city pages at
// /events/in/<country>/<city>, proposal B). Never hand them out as event slugs.
const RESERVED_EVENT_SLUGS = new Set(["in", "series", "new", "search", "map", "near", "online"]);

type AnyAscii = (value: string) => string;
let anyAsciiPromise: Promise<AnyAscii> | null = null;

// any-ascii ships as ESM only; the API compiles to CommonJS on Node 20, where
// require() of an ES module is unavailable. A dynamic import works in both.
function loadAnyAscii(): Promise<AnyAscii> {
  anyAsciiPromise ??= import("any-ascii").then((mod) => {
    const fn = (mod as { default?: unknown }).default ?? mod;
    return fn as AnyAscii;
  });
  return anyAsciiPromise;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "-", mdash: "-",
  reg: "®", trade: "™", copy: "©",
};

// Imported titles sometimes still carry entities ("A &amp; B"), which used to
// slugify to "a-andamp-b".
function decodeEntities(value: string): string {
  let out = value;
  for (let i = 0; i < 2 && out.includes("&"); i += 1) {
    out = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, ref: string) => {
      if (ref[0] === "#") {
        const code = ref[1]?.toLowerCase() === "x" ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[ref.toLowerCase()] ?? match;
    });
  }
  return out;
}

export async function toSlugPart(value: string | null | undefined): Promise<string> {
  if (!value) return "";
  const anyAscii = await loadAnyAscii();
  // Trademark signs transliterate to "(R)"/"TM" ("5Rhythms®" → "5rhythmsr"); drop them.
  const ascii = anyAscii(decodeEntities(value).normalize("NFC").replace(/[®™©℠℗]/g, ""));
  return slugify(ascii, { lower: true, strict: true, trim: true });
}

function truncateSlug(slug: string, max: number): string {
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastHyphen = cut.lastIndexOf("-");
  return (lastHyphen > max / 2 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, "");
}

function containsTokens(haystack: string, needle: string): boolean {
  return `-${haystack}-`.includes(`-${needle}-`);
}

function joinParts(...parts: string[]): string {
  const tokens: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    // Skip a part already present ("ecstatic-dance-london" + "london").
    if (tokens.length && containsTokens(tokens.join("-"), part)) continue;
    tokens.push(part);
  }
  return truncateSlug(tokens.join("-"), MAX_SLUG_LENGTH);
}

export function isUsableTitleSlug(slug: string): boolean {
  if (!slug || PLACEHOLDER_TITLE_SLUGS.has(slug)) return false;
  // At least two letters: "1", "2-3" or a lone transliterated letter is noise.
  return (slug.match(/[a-z]/g) ?? []).length >= 2;
}

/**
 * Imported locations sometimes carry an address fragment as the city
 * ("East 3370 South Salt Lake City"); that is noise in a URL. Only a short,
 * digit-free value is used.
 */
export function usableCitySlug(citySlug: string): string {
  if (!citySlug || /\d/.test(citySlug)) return "";
  return citySlug.split("-").length <= 4 ? citySlug : "";
}

export function surnameSlug(organizerSlug: string): string {
  const tokens = organizerSlug.split("-").filter(Boolean);
  return tokens.length > 1 ? tokens[tokens.length - 1] : (tokens[0] ?? "");
}

export type EventSlugContext = {
  title: string;
  city?: string | null;
  organizerName?: string | null;
};

/** Ordered slug candidates, before any numeric suffix. Never empty. */
export async function eventSlugCandidates(ctx: EventSlugContext): Promise<string[]> {
  const [titlePart, cityRaw, organizerPart] = await Promise.all([
    toSlugPart(ctx.title),
    toSlugPart(ctx.city),
    toSlugPart(ctx.organizerName),
  ]);
  const title = truncateSlug(titlePart, MAX_TITLE_PART_LENGTH);
  const surname = surnameSlug(organizerPart);
  const cityPart = usableCitySlug(cityRaw);

  const candidates: string[] = [];
  if (isUsableTitleSlug(title)) {
    const titleCity = joinParts(title, cityPart);
    candidates.push(titleCity);
    if (surname) candidates.push(joinParts(titleCity, surname));
  } else {
    // Placeholder or untransliterable title: city + organizer.
    if (cityPart && organizerPart) candidates.push(joinParts(cityPart, organizerPart));
    else if (organizerPart) candidates.push(organizerPart);
    else if (cityPart) candidates.push(joinParts("event", cityPart));
  }
  if (!candidates.length) candidates.push("event");
  return Array.from(new Set(candidates.filter(Boolean)));
}

/**
 * First free slug for a new event. `isFree` checks both live slugs and the
 * slug-history table, so a new event never takes over a redirected URL.
 */
export async function generateEventSlug(
  ctx: EventSlugContext,
  isFree: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const isFreeSlug = async (candidate: string) => !RESERVED_EVENT_SLUGS.has(candidate) && isFree(candidate);
  const candidates = await eventSlugCandidates(ctx);
  for (const candidate of candidates) {
    if (await isFreeSlug(candidate)) return candidate;
  }
  const last = candidates[candidates.length - 1];
  for (let i = 2; i <= 50; i += 1) {
    const candidate = `${last}-${i}`;
    if (await isFreeSlug(candidate)) return candidate;
  }
  for (let i = 0; i < 20; i += 1) {
    const candidate = `${last}-${Math.floor(1000 + Math.random() * 9000000)}`;
    if (await isFreeSlug(candidate)) return candidate;
  }
  throw new Error("Could not generate unique slug for events");
}

/**
 * City-name normalization for city landing pages (SEO round 3, Proposal B).
 *
 * Raw event cities come in many spellings: "Paris"/"paris", "Zürich"/"Zurich",
 * "Saarbrücken" in decomposed Unicode, "Cologne / Koeln". cityKey() folds case,
 * diacritics and punctuation so variants share one key; exonyms and districts
 * ("wien" → vienna, "brooklyn" → new-york-city) are mapped by city_aliases.
 */
export function cityKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** URL slug for a key (ASCII letters/digits and hyphens), or "" when none. */
export function cityKeyToSlug(key: string): string {
  return key
    .replace(/[^a-z0-9 ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * English exonyms and merged districts, by country: alias key → city slug.
 * Seeded into city_aliases by scripts/seedCities.ts; the table is the source
 * of truth afterwards.
 */
export const CITY_EXONYMS: Record<string, Record<string, string>> = {
  at: { wien: "vienna" },
  be: { gent: "ghent", antwerpen: "antwerp", brussel: "brussels", bruxelles: "brussels", leuven: "leuven" },
  ch: { geneve: "geneva", genf: "geneva", luzern: "lucerne", zuerich: "zurich", bern: "bern", basel: "basel" },
  cz: { praha: "prague" },
  de: {
    munchen: "munich", muenchen: "munich", koln: "cologne", koeln: "cologne", "cologne koeln": "cologne",
    "koln cologne": "cologne", nurnberg: "nuremberg", nuernberg: "nuremberg",
  },
  dk: { kobenhavn: "copenhagen" },
  es: { sevilla: "seville" },
  gr: { athina: "athens" },
  il: { "tel aviv yafo": "tel-aviv", "tel aviv jaffa": "tel-aviv" },
  it: { roma: "rome", milano: "milan", firenze: "florence", napoli: "naples", torino: "turin", venezia: "venice" },
  nl: { "den haag": "the-hague", "s gravenhage": "the-hague" },
  pl: { warszawa: "warsaw", krakow: "krakow" },
  pt: { lisboa: "lisbon" },
  ru: { moskva: "moscow" },
  us: {
    "new york": "new-york-city", nyc: "new-york-city", brooklyn: "new-york-city",
    manhattan: "new-york-city", queens: "new-york-city",
  },
};

/** English display names for exonym targets whose slug isn't enough. */
export const CITY_DISPLAY_NAMES: Record<string, Record<string, string>> = {
  nl: { "the-hague": "The Hague" },
  us: { "new-york-city": "New York City" },
  il: { "tel-aviv": "Tel Aviv" },
};

import { describe, expect, it } from "vitest";

import { dropFarOccurrences, isCityIndexable } from "../db/cityRepo";
import { CITY_EXONYMS, cityKey, cityKeyToSlug } from "./cityKey";

describe("cityKey", () => {
  it("folds case, diacritics and punctuation so spellings share a key", () => {
    expect(cityKey("Paris")).toBe(cityKey("paris"));
    expect(cityKey("BOLOGNA")).toBe("bologna");
    expect(cityKey("Zürich")).toBe("zurich");
    // Decomposed (NFD) input, as stored for Saarbrücken.
    expect(cityKey("Saarbrücken")).toBe("saarbrucken");
    expect(cityKey("Cologne / Koeln")).toBe("cologne koeln");
    expect(cityKey("  Tel  aviv ")).toBe("tel aviv");
    expect(cityKey("Straße")).toBe("strasse");
    expect(cityKey(null)).toBe("");
  });

  it("slugs a key", () => {
    expect(cityKeyToSlug("new york city")).toBe("new-york-city");
    expect(cityKeyToSlug("zurich")).toBe("zurich");
  });

  it("maps exonyms and districts to the English page", () => {
    expect(CITY_EXONYMS.at[cityKey("Wien")]).toBe("vienna");
    expect(CITY_EXONYMS.it[cityKey("Roma")]).toBe("rome");
    expect(CITY_EXONYMS.us[cityKey("Brooklyn")]).toBe("new-york-city");
    expect(CITY_EXONYMS.de[cityKey("München")]).toBe("munich");
  });
});

describe("isCityIndexable", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  it("needs owner approval", () => {
    expect(isCityIndexable({ approved: false, below_min_since: null }, now)).toBe(false);
    expect(isCityIndexable({ approved: true, below_min_since: null }, now)).toBe(true);
  });
  it("keeps a page indexed for 30 days below the minimum, then noindex", () => {
    expect(isCityIndexable({ approved: true, below_min_since: new Date("2026-10-20T00:00:00Z") }, now)).toBe(true);
    expect(isCityIndexable({ approved: true, below_min_since: new Date("2026-10-01T00:00:00Z") }, now)).toBe(false);
  });
});

describe("dropFarOccurrences", () => {
  it("drops a same-name city far away (Portland ME on the Portland OR page)", () => {
    const or = { lat: 45.52, lng: -122.68 };
    const rows = [or, or, or, { lat: 45.5, lng: -122.6 }, { lat: 43.66, lng: -70.26 }, { lat: null, lng: null }];
    const kept = dropFarOccurrences(rows);
    expect(kept).toHaveLength(5);
    expect(kept.some((r) => r.lng === -70.26)).toBe(false);
  });
  it("leaves small samples alone", () => {
    const rows = [{ lat: 45.52, lng: -122.68 }, { lat: 43.66, lng: -70.26 }];
    expect(dropFarOccurrences(rows)).toHaveLength(2);
  });
});

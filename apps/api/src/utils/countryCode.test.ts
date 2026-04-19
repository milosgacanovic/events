import { describe, expect, it } from "vitest";

import { inferCountryCode } from "./countryCode";

describe("inferCountryCode", () => {
  it("returns the normalized 2-letter code when provided directly", () => {
    expect(inferCountryCode("US", null)).toBe("us");
    expect(inferCountryCode("de", null)).toBe("de");
    expect(inferCountryCode("  FR  ", null)).toBe("fr");
  });

  it("ignores non-2-letter countryCode values and falls back to address", () => {
    expect(inferCountryCode("USA", "1 Main St, Austin, United States")).toBe("us");
    expect(inferCountryCode("", "Berlin, Germany")).toBe("de");
    expect(inferCountryCode(null, "Rome, Italy")).toBe("it");
    expect(inferCountryCode(undefined, "Paris, France")).toBe("fr");
  });

  it("matches the last comma-separated segment case-insensitively", () => {
    expect(inferCountryCode(null, "Belgrade, SERBIA")).toBe("rs");
    expect(inferCountryCode(null, "London, United Kingdom")).toBe("gb");
    expect(inferCountryCode(null, "London, United Kingdom (UK)")).toBe("gb");
  });

  it("handles Turkey/Turkiye spellings", () => {
    expect(inferCountryCode(null, "Istanbul, Turkey")).toBe("tr");
    expect(inferCountryCode(null, "Istanbul, Turkiye")).toBe("tr");
  });

  it("recognizes United Arab Emirates even if not the last segment", () => {
    expect(inferCountryCode(null, "Dubai, United Arab Emirates")).toBe("ae");
    expect(inferCountryCode(null, "United Arab Emirates, Middle East")).toBe("ae");
  });

  it("returns null for unknown country names", () => {
    expect(inferCountryCode(null, "Somewhere, Atlantis")).toBeNull();
  });

  it("returns null when both inputs are empty/nullish", () => {
    expect(inferCountryCode(null, null)).toBeNull();
    expect(inferCountryCode(undefined, undefined)).toBeNull();
    expect(inferCountryCode("", "")).toBeNull();
    expect(inferCountryCode("   ", "   ")).toBeNull();
  });

  it("ignores trailing empty segments when finding the last token", () => {
    expect(inferCountryCode(null, "Madrid, Spain,")).toBe("es");
    expect(inferCountryCode(null, "Madrid, Spain, ,")).toBe("es");
  });
});

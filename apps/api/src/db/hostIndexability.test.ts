import { describe, expect, it } from "vitest";
import { hostBioPlainText, isHostIndexable, THIN_HOST_MIN_BIO_CHARS } from "@dr-events/shared";

const now = new Date("2026-11-11T12:00:00Z");
const thin = {
  status: "published",
  hasUpcomingEvent: false,
  lastEventStartedAt: null,
  bioLength: 0,
};

describe("isHostIndexable (thin-host policy)", () => {
  it("noindexes an inactive host without a bio", () => {
    expect(isHostIndexable(thin, now)).toBe(false);
  });
  it("indexes a host with an upcoming event", () => {
    expect(isHostIndexable({ ...thin, hasUpcomingEvent: true }, now)).toBe(true);
  });
  it("indexes a host whose last event started within 12 months", () => {
    expect(isHostIndexable({ ...thin, lastEventStartedAt: "2026-01-15T10:00:00Z" }, now)).toBe(true);
    expect(isHostIndexable({ ...thin, lastEventStartedAt: "2025-10-01T10:00:00Z" }, now)).toBe(false);
  });
  it("indexes an inactive host with a real bio", () => {
    expect(isHostIndexable({ ...thin, bioLength: THIN_HOST_MIN_BIO_CHARS }, now)).toBe(true);
    expect(isHostIndexable({ ...thin, bioLength: THIN_HOST_MIN_BIO_CHARS - 1 }, now)).toBe(false);
  });
  it("never indexes an unpublished host", () => {
    expect(isHostIndexable({ ...thin, status: "draft", hasUpcomingEvent: true }, now)).toBe(false);
  });
});

describe("hostBioPlainText", () => {
  it("measures description_html as rendered text (entities decoded once, tags gone)", () => {
    expect(hostBioPlainText("<p>Dance &amp; movement</p><p>since 2001</p>", {})).toBe("Dance & movement since 2001");
  });
  it("falls back to the description JSON like the host page does", () => {
    expect(hostBioPlainText(null, { html: "<p>From JSON</p>" })).toBe("From JSON");
    expect(hostBioPlainText("", { bio: "Bio", description: "More" })).toBe("Bio More");
    expect(hostBioPlainText(null, { text: "plain" })).toBe("plain");
    expect(hostBioPlainText(null, null)).toBe("");
  });
});

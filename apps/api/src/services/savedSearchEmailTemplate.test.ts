import { describe, expect, it } from "vitest";

import { renderSavedSearchDigestEmail } from "./savedSearchEmailTemplate";

const baseEvent = {
  eventId: "00000000-0000-0000-0000-000000000001",
  eventSlug: "ecstatic-dance-berlin",
  eventTitle: "Ecstatic Dance Berlin",
  startsAtUtc: "2026-05-15T18:00:00.000Z",
  eventTimezone: "Europe/Berlin",
  city: "Berlin",
  countryCode: "de",
};

describe("renderSavedSearchDigestEmail", () => {
  it("singular subject when count = 1", () => {
    const { subject } = renderSavedSearchDigestEmail({
      userDisplayName: null,
      searchLabel: null,
      filterSummary: "",
      filterUrl: "https://events.danceresource.org/events",
      unsubscribeToken: "11111111-1111-1111-1111-111111111111",
      events: [baseEvent],
      totalMatches: 1,
    });
    expect(subject).toBe("1 new event matches your saved search");
  });

  it("plural subject when count > 1", () => {
    const { subject } = renderSavedSearchDigestEmail({
      userDisplayName: null,
      searchLabel: null,
      filterSummary: "",
      filterUrl: "https://events.danceresource.org/events",
      unsubscribeToken: "11111111-1111-1111-1111-111111111111",
      events: [baseEvent, baseEvent],
      totalMatches: 2,
    });
    expect(subject).toBe("2 new events match your saved search");
  });

  it("includes the search label in the subject when provided", () => {
    const { subject } = renderSavedSearchDigestEmail({
      userDisplayName: null,
      searchLabel: "Salsa in Berlin",
      filterSummary: "",
      filterUrl: "https://events.danceresource.org/events",
      unsubscribeToken: "11111111-1111-1111-1111-111111111111",
      events: [baseEvent],
      totalMatches: 1,
    });
    expect(subject).toContain('"Salsa in Berlin"');
  });

  it("renders the unsubscribe link with the saved-search token route", () => {
    const { html } = renderSavedSearchDigestEmail({
      userDisplayName: null,
      searchLabel: null,
      filterSummary: "",
      filterUrl: "https://events.danceresource.org/events",
      unsubscribeToken: "11111111-1111-1111-1111-111111111111",
      events: [baseEvent],
      totalMatches: 1,
    });
    expect(html).toContain("/api/saved-searches/unsubscribe?token=11111111-1111-1111-1111-111111111111");
  });

  it('renders "see N more" link when totalMatches exceeds events.length', () => {
    const { html } = renderSavedSearchDigestEmail({
      userDisplayName: null,
      searchLabel: null,
      filterSummary: "",
      filterUrl: "https://events.danceresource.org/events?q=salsa",
      unsubscribeToken: "11111111-1111-1111-1111-111111111111",
      events: [baseEvent, baseEvent],
      totalMatches: 21,
    });
    expect(html).toContain("See 19 more");
    expect(html).toContain("https://events.danceresource.org/events?q=salsa");
  });

  it('omits "see N more" when totalMatches equals events.length', () => {
    const { html } = renderSavedSearchDigestEmail({
      userDisplayName: null,
      searchLabel: null,
      filterSummary: "",
      filterUrl: "https://events.danceresource.org/events",
      unsubscribeToken: "11111111-1111-1111-1111-111111111111",
      events: [baseEvent, baseEvent, baseEvent],
      totalMatches: 3,
    });
    expect(html).not.toContain("See ");
  });

  it("escapes HTML in user display name and event title", () => {
    const { html } = renderSavedSearchDigestEmail({
      userDisplayName: '<script>alert("xss")</script>',
      searchLabel: null,
      filterSummary: "",
      filterUrl: "https://events.danceresource.org/events",
      unsubscribeToken: "11111111-1111-1111-1111-111111111111",
      events: [{ ...baseEvent, eventTitle: '<img src=x onerror="alert(1)">' }],
      totalMatches: 1,
    });
    // Dangerous tokens must appear in escaped form, not literal: no live
    // <script>, no live onerror handler. The escaped substring `onerror=` is
    // *inside* an `&lt;img …&gt;` text node so the browser never parses it.
    expect(html).not.toContain("<script>");
    expect(html).not.toMatch(/<img[^>]*onerror=/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("links each event to its public slug page", () => {
    const { html } = renderSavedSearchDigestEmail({
      userDisplayName: null,
      searchLabel: null,
      filterSummary: "",
      filterUrl: "https://events.danceresource.org/events",
      unsubscribeToken: "11111111-1111-1111-1111-111111111111",
      events: [baseEvent],
      totalMatches: 1,
    });
    expect(html).toContain("/events/ecstatic-dance-berlin");
  });

  it("greets generically when no display name is provided", () => {
    const { html } = renderSavedSearchDigestEmail({
      userDisplayName: null,
      searchLabel: null,
      filterSummary: "",
      filterUrl: "https://events.danceresource.org/events",
      unsubscribeToken: "11111111-1111-1111-1111-111111111111",
      events: [baseEvent],
      totalMatches: 1,
    });
    expect(html).toContain("Hi,");
  });
});

import { describe, expect, it } from "vitest";

import { eventSlugCandidates, generateEventSlug, isUsableTitleSlug, toSlugPart } from "./eventSlug";

function freeExcept(taken: string[]) {
  const set = new Set(taken);
  return async (candidate: string) => !set.has(candidate);
}

describe("generateEventSlug (new events)", () => {
  it("uses title + city when free", async () => {
    const slug = await generateEventSlug(
      { title: "Emerging Waves", city: "Den Haag", organizerName: "Ana Freitas" },
      freeExcept([]),
    );
    expect(slug).toBe("emerging-waves-den-haag");
  });

  it("adds the organizer surname on a generic-title collision, numbers only as last resort", async () => {
    const ctx = { title: "Emerging Waves", city: "Den Haag", organizerName: "Ana Freitas" };
    expect(await generateEventSlug(ctx, freeExcept(["emerging-waves-den-haag"]))).toBe(
      "emerging-waves-den-haag-freitas",
    );
    expect(
      await generateEventSlug(ctx, freeExcept(["emerging-waves-den-haag", "emerging-waves-den-haag-freitas"])),
    ).toBe("emerging-waves-den-haag-freitas-2");
  });

  it("transliterates a Hebrew title instead of producing item-NNN", async () => {
    const slug = await generateEventSlug(
      { title: "ריקוד אקסטטי", city: "Tel Aviv", organizerName: "Noa Levi" },
      freeExcept([]),
    );
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(slug).not.toMatch(/^item/);
    expect(slug.endsWith("-tel-aviv")).toBe(true);
    expect(slug.length).toBeGreaterThan("-tel-aviv".length);
  });

  it("transliterates Serbian Cyrillic", async () => {
    const slug = await generateEventSlug(
      { title: "Плес у Београду", city: "Београд", organizerName: "Милош Гачановић" },
      freeExcept([]),
    );
    // "Beogradu" contains the city token only as a substring, so the city is appended.
    expect(slug).toBe("ples-u-beogradu-beograd");
  });

  it("transliterates Arabic", async () => {
    const slug = await generateEventSlug({ title: "رقص النشوة", city: "Dubai", organizerName: null }, freeExcept([]));
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(slug).not.toMatch(/^item/);
    expect(slug.endsWith("-dubai")).toBe(true);
  });

  it("builds a placeholder title (TBD) from city + organizer", async () => {
    expect(
      await generateEventSlug({ title: "TBD", city: "Den Haag", organizerName: "Ana Freitas" }, freeExcept([])),
    ).toBe("den-haag-ana-freitas");
    expect(await generateEventSlug({ title: "tbd", city: null, organizerName: "Ana Freitas" }, freeExcept([]))).toBe(
      "ana-freitas",
    );
    expect(await generateEventSlug({ title: "TBD", city: null, organizerName: null }, freeExcept([]))).toBe("event");
    expect(await generateEventSlug({ title: "TBD", city: null, organizerName: null }, freeExcept(["event"]))).toBe(
      "event-2",
    );
  });

  it("does not repeat a city already in the title", async () => {
    const candidates = await eventSlugCandidates({
      title: "Ecstatic Dance London",
      city: "London",
      organizerName: "Ecstatic Dance London",
    });
    expect(candidates[0]).toBe("ecstatic-dance-london");
  });

  it("decodes HTML entities instead of slugging them (no '-andamp-')", async () => {
    expect(await toSlugPart("Breath &amp; Movement")).toBe("breath-and-movement");
  });

  it("drops the city for online events when none is given and keeps slugs bounded", async () => {
    const slug = await generateEventSlug(
      { title: "A".repeat(10) + " " + "very long title words ".repeat(10), city: null, organizerName: null },
      freeExcept([]),
    );
    expect(slug.length).toBeLessThanOrEqual(90);
    expect(slug).not.toMatch(/-$/);
  });
});

describe("reserved slugs", () => {
  it("never returns a reserved route word", async () => {
    expect(await generateEventSlug({ title: "In", city: null, organizerName: null }, freeExcept([]))).toBe("in-2");
    expect(await generateEventSlug({ title: "In", city: "Berlin", organizerName: null }, freeExcept([]))).toBe(
      "in-berlin",
    );
  });
});

describe("isUsableTitleSlug", () => {
  it("rejects placeholders and noise", () => {
    expect(isUsableTitleSlug("tbd")).toBe(false);
    expect(isUsableTitleSlug("tba")).toBe(false);
    expect(isUsableTitleSlug("event")).toBe(false);
    expect(isUsableTitleSlug("2")).toBe(false);
    expect(isUsableTitleSlug("")).toBe(false);
    expect(isUsableTitleSlug("waves")).toBe(true);
  });
});

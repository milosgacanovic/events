import { describe, expect, it, vi } from "vitest";

import { createLocation, updateLocation } from "./locationRepo";

function mockPoolReturning(row: Record<string, unknown> = {}) {
  const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: "loc-1", ...row }] });
  return { pool: { query } as never, query };
}

describe("locationRepo.createLocation", () => {
  it("preserves a multi-word city even when label equals city (regression: previously nulled)", async () => {
    const { pool, query } = mockPoolReturning({ city: "Los Angeles" });
    await createLocation(pool, {
      label: "Los Angeles",
      formattedAddress: "Los Angeles, United States",
      countryCode: "US",
      city: "Los Angeles",
      lat: 34.05,
      lng: -118.24,
    });
    const params = query.mock.calls[0][1] as unknown[];
    // params: [label, formattedAddress, countryCode, city, lng, lat]
    expect(params[3]).toBe("Los Angeles");
  });

  it("preserves a single-word city", async () => {
    const { pool, query } = mockPoolReturning();
    await createLocation(pool, {
      label: "Paris",
      formattedAddress: "Paris, France",
      countryCode: "FR",
      city: "Paris",
      lat: 48.85,
      lng: 2.35,
    });
    expect((query.mock.calls[0][1] as unknown[])[3]).toBe("Paris");
  });

  it("preserves a Cyrillic / diacritic city name", async () => {
    const { pool, query } = mockPoolReturning();
    await createLocation(pool, {
      label: "São Teotónio",
      formattedAddress: "São Teotónio, Portugal",
      countryCode: "PT",
      city: "São Teotónio",
      lat: 37.5,
      lng: -8.7,
    });
    expect((query.mock.calls[0][1] as unknown[])[3]).toBe("São Teotónio");
  });

  it("nulls an empty / whitespace-only city", async () => {
    const { pool, query } = mockPoolReturning();
    await createLocation(pool, {
      label: "Some Venue",
      formattedAddress: "Some Venue, X",
      countryCode: "XX",
      city: "   ",
      lat: 0,
      lng: 0,
    });
    expect((query.mock.calls[0][1] as unknown[])[3]).toBeNull();
  });

  it("nulls a missing (undefined) city", async () => {
    const { pool, query } = mockPoolReturning();
    await createLocation(pool, {
      label: "Some Venue",
      formattedAddress: "Some Venue, X",
      countryCode: "XX",
      lat: 0,
      lng: 0,
    });
    expect((query.mock.calls[0][1] as unknown[])[3]).toBeNull();
  });

  it("nulls a city containing a UK postcode (kept-rule regression guard)", async () => {
    const { pool, query } = mockPoolReturning();
    await createLocation(pool, {
      label: "Some Hall",
      formattedAddress: "Some Hall, London N6 6BA, UK",
      countryCode: "GB",
      city: "London N6 6BA",
      lat: 51.5,
      lng: -0.1,
    });
    expect((query.mock.calls[0][1] as unknown[])[3]).toBeNull();
  });

  it("trims surrounding whitespace from city", async () => {
    const { pool, query } = mockPoolReturning();
    await createLocation(pool, {
      label: "Berlin",
      formattedAddress: "Berlin, Germany",
      countryCode: "DE",
      city: "  Berlin  ",
      lat: 52.5,
      lng: 13.4,
    });
    expect((query.mock.calls[0][1] as unknown[])[3]).toBe("Berlin");
  });
});

describe("locationRepo.updateLocation", () => {
  it("preserves multi-word city when label equals city (regression)", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const pool = { query } as never;
    await updateLocation(pool, "loc-1", {
      label: "Chiang Mai",
      formattedAddress: "Chiang Mai, Thailand",
      countryCode: "TH",
      city: "Chiang Mai",
      lat: 18.79,
      lng: 98.98,
    });
    // params: [id, label, formattedAddress, countryCode, city, lat, lng]
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[4]).toBe("Chiang Mai");
  });

  it("nulls UK postcode in city on update", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const pool = { query } as never;
    await updateLocation(pool, "loc-1", {
      label: "Foo Hall",
      formattedAddress: "Foo Hall, SW1A 1AA, UK",
      countryCode: "GB",
      city: "SW1A 1AA",
      lat: 0,
      lng: 0,
    });
    expect((query.mock.calls[0][1] as unknown[])[4]).toBeNull();
  });
});

import { describe, expect, it, beforeEach } from "vitest";

import {
  clearSearchCache,
  getSearchCache,
  setSearchCache,
} from "./searchCache";

describe("searchCache", () => {
  beforeEach(() => {
    clearSearchCache();
  });

  it("returns null for a miss", () => {
    expect(getSearchCache("events_search", { q: "unseen" })).toBeNull();
  });

  it("round-trips a value under the same namespace+payload", () => {
    const payload = { q: "tango", page: 1 };
    const value = { hits: [1, 2, 3] };
    setSearchCache("events_search", payload, value);
    expect(getSearchCache("events_search", payload)).toEqual(value);
  });

  it("keys depend on payload content, not reference", () => {
    setSearchCache("events_search", { q: "x" }, { n: 1 });
    // A fresh object with identical fields still hits.
    expect(getSearchCache("events_search", { q: "x" })).toEqual({ n: 1 });
  });

  it("different payloads under the same namespace do not collide", () => {
    setSearchCache("events_search", { q: "a" }, { n: 1 });
    setSearchCache("events_search", { q: "b" }, { n: 2 });
    expect(getSearchCache("events_search", { q: "a" })).toEqual({ n: 1 });
    expect(getSearchCache("events_search", { q: "b" })).toEqual({ n: 2 });
  });

  it("same payload under different namespaces does not collide", () => {
    const payload = { q: "same" };
    setSearchCache("events_search", payload, { src: "events" });
    setSearchCache("organizers_search", payload, { src: "orgs" });
    expect(getSearchCache("events_search", payload)).toEqual({ src: "events" });
    expect(getSearchCache("organizers_search", payload)).toEqual({ src: "orgs" });
  });

  it("clearSearchCache drops all entries", () => {
    setSearchCache("events_search", { q: "a" }, { n: 1 });
    setSearchCache("map_clusters", { z: 3 }, { n: 2 });
    clearSearchCache();
    expect(getSearchCache("events_search", { q: "a" })).toBeNull();
    expect(getSearchCache("map_clusters", { z: 3 })).toBeNull();
  });
});

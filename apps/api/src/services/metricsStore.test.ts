import { describe, expect, it, beforeEach } from "vitest";

import {
  getMetricsSnapshot,
  recordPublish,
  recordSearchDuration,
  resetMetricsForTests,
} from "./metricsStore";

describe("metricsStore", () => {
  beforeEach(() => {
    resetMetricsForTests();
  });

  it("starts at zero", () => {
    expect(getMetricsSnapshot()).toEqual({
      search_count: 0,
      publish_count: 0,
      avg_search_duration_ms: 0,
    });
  });

  it("increments publish count each call", () => {
    recordPublish();
    recordPublish();
    recordPublish();
    expect(getMetricsSnapshot().publish_count).toBe(3);
  });

  it("computes a running average of search durations", () => {
    recordSearchDuration(100);
    recordSearchDuration(200);
    recordSearchDuration(300);
    const snap = getMetricsSnapshot();
    expect(snap.search_count).toBe(3);
    expect(snap.avg_search_duration_ms).toBe(200);
  });

  it("treats negative/NaN/Infinity durations as zero but still counts the call", () => {
    recordSearchDuration(-10);
    recordSearchDuration(Number.NaN);
    recordSearchDuration(Number.POSITIVE_INFINITY);
    const snap = getMetricsSnapshot();
    expect(snap.search_count).toBe(3);
    expect(snap.avg_search_duration_ms).toBe(0);
  });

  it("rounds avg to 3 decimal places", () => {
    recordSearchDuration(1);
    recordSearchDuration(2);
    recordSearchDuration(2);
    // Average = 5/3 = 1.6666... -> 1.667
    expect(getMetricsSnapshot().avg_search_duration_ms).toBe(1.667);
  });

  it("resetMetricsForTests zeroes all counters", () => {
    recordSearchDuration(50);
    recordPublish();
    resetMetricsForTests();
    expect(getMetricsSnapshot()).toEqual({
      search_count: 0,
      publish_count: 0,
      avg_search_duration_ms: 0,
    });
  });
});

type MetricsSnapshot = {
  search_count: number;
  publish_count: number;
  avg_search_duration_ms: number;
};

const state: MetricsSnapshot = {
  search_count: 0,
  publish_count: 0,
  avg_search_duration_ms: 0,
};

export function recordSearchDuration(durationMs: number): void {
  const sanitized = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
  state.search_count += 1;
  const n = state.search_count;
  state.avg_search_duration_ms = ((state.avg_search_duration_ms * (n - 1)) + sanitized) / n;
}

export function recordPublish(): void {
  state.publish_count += 1;
}

export function getMetricsSnapshot(): MetricsSnapshot {
  return {
    search_count: state.search_count,
    publish_count: state.publish_count,
    avg_search_duration_ms: Number(state.avg_search_duration_ms.toFixed(3)),
  };
}

export function resetMetricsForTests(): void {
  state.search_count = 0;
  state.publish_count = 0;
  state.avg_search_duration_ms = 0;
}

// Client-side feature flags mirrored from the API via NEXT_PUBLIC_ env vars.
// Keep these in sync with `apps/api/src/config.ts`. The pattern: API reads
// `FLAG_NAME` from env; web reads `NEXT_PUBLIC_FLAG_NAME` with the same value
// supplied by the deploy pipeline. Both components need a rebuild/restart to
// pick up flag changes.

export function isSeriesGroupingEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_EVENTS_SERIES_GROUPING_ENABLED;
  return raw === "true" || raw === "1";
}

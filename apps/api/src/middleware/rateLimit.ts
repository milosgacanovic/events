type Bucket = {
  hits: number[];
};

const buckets = new Map<string, Bucket>();

function trimBucket(bucket: Bucket, now: number, windowMs: number): void {
  const threshold = now - windowMs;
  while (bucket.hits.length > 0 && bucket.hits[0] <= threshold) {
    bucket.hits.shift();
  }
}

export function checkRateLimit(input: {
  key: string;
  now: number;
  windowMs: number;
  maxRequests: number;
}): { allowed: boolean; retryAfterSeconds: number } {
  const existing = buckets.get(input.key) ?? { hits: [] };
  trimBucket(existing, input.now, input.windowMs);

  if (existing.hits.length >= input.maxRequests) {
    const oldest = existing.hits[0] ?? input.now;
    const retryAfterMs = Math.max(0, oldest + input.windowMs - input.now);
    buckets.set(input.key, existing);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  existing.hits.push(input.now);
  buckets.set(input.key, existing);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimitBuckets(): void {
  buckets.clear();
}

export function resolveAdminRateLimit(path: string): number | null {
  if (path.startsWith("/api/admin/")) {
    return 300;
  }
  return null;
}

/**
 * Per-user rate limit for write endpoints that trigger cascading work
 * (publish/unpublish/cancel/archive regenerate occurrences + push to Meili;
 * uploads write to disk). Keep moderately lenient so normal editing isn't
 * throttled — the intent is to prevent notification/churn spam, not ordinary
 * bulk edits. Key is userSub (falls back to IP for unauthenticated callers,
 * which shouldn't reach these routes anyway thanks to requireEditor).
 */
export const WRITE_RATE_LIMIT_MAX = 12;
export const WRITE_RATE_LIMIT_BULK_MAX = 300;
export const WRITE_RATE_LIMIT_WINDOW_MS = 60_000;

export function checkWriteRateLimit(
  subject: string,
  operation: string,
  maxOverride?: number,
): { allowed: boolean; retryAfterSeconds: number } {
  return checkRateLimit({
    key: `write:${operation}:${subject}`,
    now: Date.now(),
    windowMs: WRITE_RATE_LIMIT_WINDOW_MS,
    maxRequests: maxOverride ?? WRITE_RATE_LIMIT_MAX,
  });
}

export function resolvePublicRateLimit(path: string, _baseLimit: number): number | null {
  if (path === "/api/events/search") {
    return 300;
  }
  if (path === "/api/organizers/search") {
    return 240;
  }
  if (path === "/api/map/clusters") {
    return 240;
  }
  if (path === "/api/map/organizer-clusters") {
    return 240;
  }
  if (path.startsWith("/api/meta/")) {
    return 300;
  }
  return null;
}

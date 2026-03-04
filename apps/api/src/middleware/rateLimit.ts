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

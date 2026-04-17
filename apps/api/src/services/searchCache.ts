import { createHash } from "node:crypto";

import { LRUCache } from "lru-cache";

type CacheValue = object;

// 120s origin TTL. Longer than the edge's s-maxage=60 so the origin can
// serve repeated requests from memory while the CDN revalidates. Safe
// because every event-write lifecycle calls clearSearchCache() — the TTL
// is only a ceiling for cases where no write fires.
const cache = new LRUCache<string, CacheValue>({
  max: 1000,
  ttl: 120_000,
});

type SearchCacheNamespace = "events_search" | "organizers_search" | "map_clusters" | "organizers_map_clusters";

function keyFor(namespace: SearchCacheNamespace, payload: unknown): string {
  const digest = createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  return `${namespace}:${digest}`;
}

export function getSearchCache<T extends object>(
  namespace: SearchCacheNamespace,
  payload: unknown,
): T | null {
  const value = cache.get(keyFor(namespace, payload));
  if (value === undefined) {
    return null;
  }
  return value as T;
}

export function setSearchCache(
  namespace: SearchCacheNamespace,
  payload: unknown,
  value: object,
): void {
  cache.set(keyFor(namespace, payload), value as CacheValue);
}

export function clearSearchCache(): void {
  cache.clear();
}

let debouncedClearTimer: ReturnType<typeof setTimeout> | null = null;

export function debouncedClearSearchCache(delayMs = 5000): void {
  if (debouncedClearTimer !== null) {
    return;
  }
  debouncedClearTimer = setTimeout(() => {
    debouncedClearTimer = null;
    cache.clear();
  }, delayMs);
}

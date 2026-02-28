import { createHash } from "node:crypto";

import { LRUCache } from "lru-cache";

type CacheValue = object;

const cache = new LRUCache<string, CacheValue>({
  max: 500,
  ttl: 30_000,
});

function keyFor(namespace: "events_search" | "map_clusters", payload: unknown): string {
  const digest = createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  return `${namespace}:${digest}`;
}

export function getSearchCache<T extends object>(
  namespace: "events_search" | "map_clusters",
  payload: unknown,
): T | null {
  const value = cache.get(keyFor(namespace, payload));
  if (value === undefined) {
    return null;
  }
  return value as T;
}

export function setSearchCache(
  namespace: "events_search" | "map_clusters",
  payload: unknown,
  value: object,
): void {
  cache.set(keyFor(namespace, payload), value as CacheValue);
}

export function clearSearchCache(): void {
  cache.clear();
}

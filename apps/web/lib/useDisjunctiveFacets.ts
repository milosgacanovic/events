"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { authorizedGet } from "./manageApi";

/**
 * Describes a facet group: which key in the facets response it maps to,
 * and which URL param name is used to filter by it.
 */
export type FacetGroupSpec = {
  /** Key in the facets response object (e.g. "statuses", "practiceCategoryIds") */
  responseKey: string;
  /** URL param name used when calling the facets endpoint (e.g. "status", "practiceCategoryId") */
  filterParam: string;
};

type FacetsResult = Record<string, Record<string, number>>;

/**
 * Builds a query string for the facets endpoint, optionally excluding one filter group.
 */
function buildFacetParams(
  activeFilters: Record<string, string>,
  excludeParam?: string,
): string {
  const params = new URLSearchParams();
  for (const [param, value] of Object.entries(activeFilters)) {
    if (value && param !== excludeParam) {
      params.set(param, value);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Disjunctive faceting hook for manage pages.
 *
 * For each filter group with active selections, makes a separate request
 * excluding that group's filter. Returns merged facet counts where each
 * group's counts reflect the "as if this group had no filter" state.
 *
 * @param endpoint - Facets API path (e.g. "/admin/events/facets")
 * @param groups - Facet group specifications
 * @param activeFilters - Current filter values keyed by URL param name (only non-empty values)
 * @param getToken - Auth token getter
 * @param enabled - Whether to fetch (gate on initialization)
 */
export function useDisjunctiveFacets<T extends FacetsResult>(
  endpoint: string,
  groups: FacetGroupSpec[],
  activeFilters: Record<string, string>,
  getToken: () => Promise<string | null>,
  enabled: boolean = true,
  refreshKey: number = 0,
): T | null {
  const [facets, setFacets] = useState<T | null>(null);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchFacets = useCallback(async () => {
    if (!enabled) return;

    const currentRequestId = ++requestIdRef.current;

    // Identify which groups have active selections
    const activeGroups = groups.filter((g) => {
      const val = activeFilters[g.filterParam];
      return val && val.length > 0;
    });

    try {
      // Always make a base request with all filters applied
      const basePromise = authorizedGet<T>(
        getToken,
        `${endpoint}${buildFacetParams(activeFilters)}`,
      );

      // For each active group, make a request excluding that group's filter
      const disjunctivePromises = activeGroups.map((group) =>
        authorizedGet<T>(
          getToken,
          `${endpoint}${buildFacetParams(activeFilters, group.filterParam)}`,
        ).then((result) => ({ group, result })),
      );

      const [baseResult, ...disjunctiveResults] = await Promise.all([
        basePromise,
        ...disjunctivePromises,
      ]);

      // Discard stale responses
      if (currentRequestId !== requestIdRef.current) return;

      // Merge: start with base (correct for non-active groups),
      // override with disjunctive results for active groups
      const merged = { ...baseResult } as Record<string, Record<string, number>>;
      for (const { group, result } of disjunctiveResults) {
        merged[group.responseKey] = result[group.responseKey as keyof T] as Record<string, number>;
      }

      setFacets(merged as T);
    } catch {
      // Ignore fetch errors — facets are non-critical
    }
  }, [endpoint, groups, activeFilters, getToken, enabled, refreshKey]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchFacets();
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchFacets]);

  return facets;
}

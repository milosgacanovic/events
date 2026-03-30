"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Param spec entry: maps a state field to a URL param name and type.
 */
type ParamSpec = {
  param: string;
  type: "string" | "csv" | "number";
};

type FilterState = Record<string, string | string[] | number>;

function readParam(
  searchParams: URLSearchParams,
  spec: ParamSpec,
): string | string[] | number {
  const raw = searchParams.get(spec.param) ?? "";
  switch (spec.type) {
    case "csv":
      return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    case "number":
      return raw ? parseInt(raw, 10) || 1 : 1;
    default:
      return raw;
  }
}

function writeParams(
  state: FilterState,
  specs: Record<string, ParamSpec>,
): string {
  const params = new URLSearchParams();
  for (const [key, spec] of Object.entries(specs)) {
    const value = state[key];
    if (value == null) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(spec.param, value.join(","));
    } else if (typeof value === "number") {
      if (value > 1) params.set(spec.param, String(value));
    } else {
      if (value) params.set(spec.param, value);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Bidirectional URL-to-state sync hook for manage filter pages.
 *
 * Reads initial filter state from URL params on mount, and writes
 * state changes back to URL via replaceState with debounce.
 */
export function useManageUrlFilters<T extends FilterState>(
  specs: Record<keyof T & string, ParamSpec>,
  defaults: T,
): {
  filters: T;
  setFilter: <K extends keyof T & string>(key: K, value: T[K]) => void;
  setFilters: (partial: Partial<T>) => void;
  isInitialized: boolean;
} {
  const searchParams = useSearchParams();
  const [filters, setFiltersState] = useState<T>(defaults);
  const syncingFromUrlRef = useRef(false);
  const initializedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Read from URL on mount and when searchParams change
  useEffect(() => {
    const parsed = {} as Record<string, string | string[] | number>;
    let hasUrlParams = false;
    for (const [key, spec] of Object.entries(specs)) {
      const val = readParam(searchParams, spec as ParamSpec);
      parsed[key] = val;
      // Check if the URL actually has this param
      if (searchParams.has((spec as ParamSpec).param)) hasUrlParams = true;
    }

    // Only sync from URL if URL has params or on first mount
    syncingFromUrlRef.current = true;
    setFiltersState(parsed as T);
    initializedRef.current = true;

    // Clear the syncing flag after state settles
    setTimeout(() => {
      syncingFromUrlRef.current = false;
    }, 0);
  }, [searchParams]); // specs is stable (defined outside component)

  // Write to URL when filters change
  useEffect(() => {
    if (syncingFromUrlRef.current || !initializedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const qs = writeParams(filters as FilterState, specs as Record<string, ParamSpec>);
      const newUrl = window.location.pathname + qs;
      if (newUrl !== window.location.pathname + window.location.search) {
        window.history.replaceState(null, "", newUrl);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters, specs]);

  const setFilter = useCallback(<K extends keyof T & string>(key: K, value: T[K]) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setFilters = useCallback((partial: Partial<T>) => {
    setFiltersState((prev) => ({ ...prev, ...partial }));
  }, []);

  return {
    filters,
    setFilter,
    setFilters,
    isInitialized: initializedRef.current,
  };
}

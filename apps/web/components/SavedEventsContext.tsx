"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { fetchJson } from "../lib/api";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";

/**
 * Coordinates saved-event status across many <SaveEventButton> instances
 * rendered together (the /events listing has 16+ cards visible at once).
 * Without this provider each button independently calls
 * `GET /profile/saved-events/status/<id>` → N parallel round-trips. With it,
 * the provider batches the visible IDs into a single
 * `GET /profile/saved-events/batch-status?eventIds=a,b,c` and each button
 * reads from the shared map.
 *
 * Buttons rendered OUTSIDE a provider (event detail page, profile pages)
 * fall back to their per-id fetch — same behavior as before, no breakage.
 */
type SavedEventsContextValue = {
  /** Map of eventId → true if saved. Absence means "not yet known". */
  knownSaved: Map<string, boolean>;
  /** Mark a single event's saved state — used by SaveEventButton after a POST/DELETE */
  setLocal: (eventId: string, saved: boolean) => void;
};

export const SavedEventsContext = createContext<SavedEventsContextValue | null>(null);

export function useSavedEventsContext(): SavedEventsContextValue | null {
  return useContext(SavedEventsContext);
}

type ProviderProps = {
  /** All event IDs currently rendered on the page. Provider issues one
   *  batch request for the IDs it hasn't seen yet whenever this list grows.
   *  Pass `[]` if the page is empty — provider sits idle. */
  visibleEventIds: readonly string[];
  children: React.ReactNode;
};

export function SavedEventsProvider({ visibleEventIds, children }: ProviderProps) {
  const auth = useKeycloakAuth();
  const [knownSaved, setKnownSaved] = useState<Map<string, boolean>>(() => new Map());
  // Track which IDs we've already requested so the diff against visibleEventIds
  // doesn't re-issue requests for IDs already in flight.
  const fetchedIdsRef = useRef<Set<string>>(new Set());

  // Reset cache on auth change — the answer for any given eventId is
  // user-specific, so a login/logout invalidates everything.
  useEffect(() => {
    setKnownSaved(new Map());
    fetchedIdsRef.current = new Set();
  }, [auth.authenticated]);

  useEffect(() => {
    if (!auth.ready || !auth.authenticated || visibleEventIds.length === 0) return;
    // Diff: only fetch IDs we haven't queried yet.
    const newIds = visibleEventIds.filter((id) => !fetchedIdsRef.current.has(id));
    if (newIds.length === 0) return;
    // Mark in-flight so concurrent renders don't double-queue.
    newIds.forEach((id) => fetchedIdsRef.current.add(id));

    let cancelled = false;
    (async () => {
      try {
        const token = await auth.getToken();
        if (!token || cancelled) return;
        const res = await fetchJson<{ savedIds: string[] }>(
          `/profile/saved-events/batch-status?eventIds=${encodeURIComponent(newIds.join(","))}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (cancelled) return;
        setKnownSaved((prev) => {
          const next = new Map(prev);
          const savedSet = new Set(res.savedIds);
          for (const id of newIds) next.set(id, savedSet.has(id));
          return next;
        });
      } catch {
        // Soft fail — leave the IDs marked as fetched (so we don't retry on
        // every render) and let SaveEventButton fall back to per-id retry on
        // mount if needed. The listing is still fully usable.
      }
    })();
    return () => {
      cancelled = true;
    };
    // visibleEventIds reference changes on every search re-render; the
    // newIds diff is what actually matters for issuing requests.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.ready, auth.authenticated, auth.getToken, visibleEventIds]);

  const setLocal = useCallback((eventId: string, saved: boolean) => {
    setKnownSaved((prev) => {
      const next = new Map(prev);
      next.set(eventId, saved);
      return next;
    });
  }, []);

  const value = useMemo<SavedEventsContextValue>(
    () => ({ knownSaved, setLocal }),
    [knownSaved, setLocal],
  );

  return <SavedEventsContext.Provider value={value}>{children}</SavedEventsContext.Provider>;
}

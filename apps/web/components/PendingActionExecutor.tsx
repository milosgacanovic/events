"use client";

import { useEffect, useRef } from "react";

import { fetchJson } from "../lib/api";
import { getPendingAction, clearPendingAction } from "../lib/pendingAction";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useToast } from "./ToastProvider";
import { useI18n } from "./i18n/I18nProvider";

/**
 * Mounted once in the root layout. After login (auth.ready && auth.authenticated),
 * checks sessionStorage for a pending gated action and executes it silently.
 * Shows a toast on success/failure, then clears the stored action.
 */
export function PendingActionExecutor() {
  const auth = useKeycloakAuth();
  const toast = useToast();
  const { t } = useI18n();
  const executed = useRef(false);

  useEffect(() => {
    if (!auth.ready || !auth.authenticated || executed.current) return;
    executed.current = true;

    const pending = getPendingAction();
    if (!pending) return;
    clearPendingAction();

    (async () => {
      try {
        const token = await auth.getToken();
        if (!token) return;

        switch (pending.action) {
          case "save_event": {
            const { eventId } = pending.payload;
            if (!eventId) break;
            await fetchJson("/profile/saved-events", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ eventId }),
            });
            toast.show(t("save.toast.saved"), "success");
            break;
          }

          case "rsvp_event": {
            const { eventId, occurrenceId } = pending.payload;
            if (!eventId) break;
            await fetchJson("/profile/rsvps", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ eventId, occurrenceId: occurrenceId || undefined }),
            });
            toast.show(t("rsvp.toast.going"), "success");
            window.dispatchEvent(
              new CustomEvent("dr:pending-rsvp", { detail: { eventId } }),
            );
            break;
          }

          case "follow_host": {
            // For follow_host, we emit a custom event so FollowHostButton
            // can open its modal (which needs organizer-specific data).
            // The button listens for this event.
            const { organizerId } = pending.payload;
            if (!organizerId) break;
            window.dispatchEvent(
              new CustomEvent("dr:pending-follow", { detail: { organizerId } }),
            );
            break;
          }
        }
      } catch {
        toast.show(t("common.actionFailed"), "error");
      }
    })();
  }, [auth.ready, auth.authenticated, auth.getToken, toast, t]);

  return null;
}

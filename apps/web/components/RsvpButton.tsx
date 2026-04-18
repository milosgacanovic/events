"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchJson } from "../lib/api";
import { setPendingAction } from "../lib/pendingAction";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { useToast } from "./ToastProvider";
import { LoginPromptDialog } from "./LoginPromptDialog";

type Props = {
  eventId: string;
  occurrenceId?: string;
};

export function RsvpButton({ eventId, occurrenceId }: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();
  const toast = useToast();

  const [going, setGoing] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  // Fetch public count (no auth needed)
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const qs = occurrenceId ? `?occurrenceId=${occurrenceId}` : "";
        const res = await fetchJson<{ count: number }>(
          `/events/${eventId}/rsvp-count${qs}`,
        );
        if (active) setCount(res.count);
      } catch {
        // soft fail
      }
    })();
    return () => { active = false; };
  }, [eventId, occurrenceId]);

  // Fetch user's RSVP status (auth required)
  useEffect(() => {
    if (!auth.ready || !auth.authenticated) return;
    let active = true;
    (async () => {
      try {
        const token = await auth.getToken();
        if (!token || !active) return;
        const qs = occurrenceId ? `?occurrenceId=${occurrenceId}` : "";
        const res = await fetchJson<{ going: boolean }>(
          `/events/${eventId}/rsvp-status${qs}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (active) setGoing(res.going);
      } catch {
        // soft fail
      }
    })();
    return () => { active = false; };
  }, [auth.ready, auth.authenticated, auth.getToken, eventId, occurrenceId]);

  // Refetch status + count when another component toggles an RSVP for this event
  // (e.g. the inline per-row button on the event detail page).
  useEffect(() => {
    async function refetch() {
      try {
        const qs = occurrenceId ? `?occurrenceId=${occurrenceId}` : "";
        const countRes = await fetchJson<{ count: number }>(
          `/events/${eventId}/rsvp-count${qs}`,
        );
        setCount(countRes.count);
        if (!auth.authenticated) return;
        const token = await auth.getToken();
        if (!token) return;
        const statusRes = await fetchJson<{ going: boolean }>(
          `/events/${eventId}/rsvp-status${qs}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setGoing(statusRes.going);
      } catch {
        // soft fail
      }
    }
    function onChanged(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.eventId === eventId) void refetch();
    }
    function onPendingRsvp(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.eventId === eventId) {
        setGoing(true);
        setCount((c) => (c ?? 0) + 1);
      }
    }
    window.addEventListener("dr:pending-rsvp", onPendingRsvp);
    window.addEventListener("dr:rsvp-changed", onChanged);
    return () => {
      window.removeEventListener("dr:pending-rsvp", onPendingRsvp);
      window.removeEventListener("dr:rsvp-changed", onChanged);
    };
  }, [eventId, occurrenceId, auth]);

  const doRsvp = useCallback(async () => {
    setLoading(true);
    try {
      const token = await auth.getToken();
      if (!token) return;
      await fetchJson("/profile/rsvps", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ eventId, occurrenceId }),
      });
      setGoing(true);
      setCount((c) => (c ?? 0) + 1);
      toast.show(t("rsvp.toast.going"), "success");
    } catch {
      toast.show(t("common.actionFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [auth.getToken, eventId, occurrenceId, toast, t]);

  const doCancel = useCallback(async () => {
    setLoading(true);
    try {
      const token = await auth.getToken();
      if (!token) return;
      const qs = occurrenceId ? `?occurrenceId=${occurrenceId}` : "";
      await fetchJson(`/profile/rsvps/${eventId}${qs}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setGoing(false);
      setCount((c) => Math.max(0, (c ?? 1) - 1));
      toast.show(t("rsvp.toast.cancelled"), "success");
    } catch {
      toast.show(t("common.actionFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [auth.getToken, eventId, occurrenceId, toast, t]);

  function handleClick() {
    if (!auth.authenticated) {
      setShowLogin(true);
      return;
    }
    if (going) {
      doCancel();
    } else {
      doRsvp();
    }
  }

  function handleLogin() {
    setShowLogin(false);
    setPendingAction({ action: "rsvp_event", payload: { eventId } });
    auth.login();
  }

  function handleRegister() {
    setShowLogin(false);
    setPendingAction({ action: "rsvp_event", payload: { eventId } });
    auth.register();
  }

  return (
    <>
      <button
        type="button"
        className={`rsvp-button${going ? " rsvp-button--going" : ""}`}
        onClick={handleClick}
        disabled={loading}
      >
        {going ? (
          <span aria-hidden="true">{"\u2713"}</span>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 7.5V3.5a1 1 0 0 1 2 0v4"/><path d="M8 4V2.5a1 1 0 0 1 2 0V7"/><path d="M10 5.5V4.5a1 1 0 0 1 2 0V9a4.5 4.5 0 0 1-4.5 4.5A4 4 0 0 1 3.5 9.5V8a1 1 0 0 1 2 0v.5"/></svg>
        )}
        <span>{going ? t("rsvp.going") : t("rsvp.imGoing")}</span>
        {count != null && count > 0 && (
          <span className="rsvp-count">{count}</span>
        )}
      </button>

      {showLogin && (
        <LoginPromptDialog
          featureKey="rsvp"
          onLogin={handleLogin}
          onRegister={handleRegister}
          onClose={() => setShowLogin(false)}
        />
      )}
    </>
  );
}

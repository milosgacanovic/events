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
        const res = await fetchJson<{ going: boolean }>(
          `/events/${eventId}/rsvp-status`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (active) setGoing(res.going);
      } catch {
        // soft fail
      }
    })();
    return () => { active = false; };
  }, [auth.ready, auth.authenticated, auth.getToken, eventId]);

  // Listen for pending-rsvp custom event from PendingActionExecutor
  useEffect(() => {
    function onPendingRsvp(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.eventId === eventId) {
        setGoing(true);
        setCount((c) => (c ?? 0) + 1);
      }
    }
    window.addEventListener("dr:pending-rsvp", onPendingRsvp);
    return () => window.removeEventListener("dr:pending-rsvp", onPendingRsvp);
  }, [eventId]);

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
        <span aria-hidden="true">{going ? "\u2713" : "\uD83D\uDC4B"}</span>
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchJson } from "../lib/api";
import { setPendingAction } from "../lib/pendingAction";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { useToast } from "./ToastProvider";
import { LoginPromptDialog } from "./LoginPromptDialog";

type Props = {
  eventId: string;
  /** True when the event is part of a recurring series */
  isRecurring?: boolean;
  /** Occurrence ID for single-date saves on recurring events */
  occurrenceId?: string;
  /** Compact mode for listing cards (icon only, no label) */
  compact?: boolean;
};

export function SaveEventButton({
  eventId,
  isRecurring,
  occurrenceId,
  compact,
}: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();
  const toast = useToast();

  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showScopeMenu, setShowScopeMenu] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showScopeMenu) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setShowScopeMenu(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowScopeMenu(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showScopeMenu]);

  // Fetch initial save status
  useEffect(() => {
    if (!auth.ready || !auth.authenticated) return;
    let active = true;
    (async () => {
      try {
        const token = await auth.getToken();
        if (!token || !active) return;
        const res = await fetchJson<{ saved: boolean }>(
          `/profile/saved-events/status/${eventId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (active) setSaved(res.saved);
      } catch {
        // soft fail
      }
    })();
    return () => { active = false; };
  }, [auth.ready, auth.authenticated, auth.getToken, eventId]);

  const doSave = useCallback(async (scope: string = "all") => {
    setLoading(true);
    try {
      const token = await auth.getToken();
      if (!token) return;
      await fetchJson("/profile/saved-events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId,
          occurrenceId: scope === "single" ? occurrenceId : undefined,
          scope,
        }),
      });
      setSaved(true);
      toast.show(t("save.toast.saved"), "success");
    } catch {
      toast.show(t("common.actionFailed"), "error");
    } finally {
      setLoading(false);
      setShowScopeMenu(false);
    }
  }, [auth.getToken, eventId, occurrenceId, toast, t]);

  const doUnsave = useCallback(async () => {
    setLoading(true);
    try {
      const token = await auth.getToken();
      if (!token) return;
      await fetchJson(`/profile/saved-events/${eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setSaved(false);
      toast.show(t("save.toast.unsaved"), "success");
    } catch {
      toast.show(t("common.actionFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [auth.getToken, eventId, toast, t]);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!auth.authenticated) {
      setShowLogin(true);
      return;
    }

    if (saved) {
      doUnsave();
      return;
    }

    // For recurring events, toggle the scope menu (open on first click, close on second)
    if (isRecurring && !saved) {
      setShowScopeMenu((v) => !v);
      return;
    }

    doSave();
  }

  function handleLogin() {
    setShowLogin(false);
    setPendingAction({ action: "save_event", payload: { eventId } });
    auth.login();
  }

  function handleRegister() {
    setShowLogin(false);
    setPendingAction({ action: "save_event", payload: { eventId } });
    auth.register();
  }

  const heartIcon = saved ? (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 14s-5.5-3.5-5.5-7A3.5 3.5 0 0 1 8 4.5 3.5 3.5 0 0 1 13.5 7C13.5 10.5 8 14 8 14Z"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M8 14s-5.5-3.5-5.5-7A3.5 3.5 0 0 1 8 4.5 3.5 3.5 0 0 1 13.5 7C13.5 10.5 8 14 8 14Z"/>
    </svg>
  );

  if (compact) {
    return (
      <>
        <button
          type="button"
          className={`save-icon-btn${saved ? " save-icon-btn--saved" : ""}`}
          onClick={handleClick}
          disabled={loading}
          aria-label={saved ? t("save.unsave") : t("save.save")}
          title={saved ? t("save.unsave") : t("save.save")}
        >
          {heartIcon}
        </button>
        {showLogin && (
          <LoginPromptDialog
            featureKey="save"
            onLogin={handleLogin}
            onRegister={handleRegister}
            onClose={() => setShowLogin(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="save-button-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`save-button${saved ? " save-button--saved" : ""}`}
        onClick={handleClick}
        disabled={loading}
        aria-expanded={showScopeMenu}
      >
        {heartIcon}
        <span>{saved ? t("save.saved") : t("save.save")}</span>
      </button>

      {showScopeMenu && (
        <div className="save-scope-menu">
          <div className="save-scope-hint">{t("save.recurringHint")}</div>
          <button type="button" className="save-scope-option" onClick={() => doSave("single")}>
            {t("save.justThisDate")}
          </button>
          <button type="button" className="save-scope-option" onClick={() => doSave("all")}>
            {t("save.allSessions")}
          </button>
        </div>
      )}

      {showLogin && (
        <LoginPromptDialog
          featureKey="save"
          onLogin={handleLogin}
          onRegister={handleRegister}
          onClose={() => setShowLogin(false)}
        />
      )}
    </div>
  );
}

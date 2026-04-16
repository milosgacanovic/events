"use client";

import { useState } from "react";

import { setPendingAction } from "../lib/pendingAction";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { LoginPromptDialog } from "./LoginPromptDialog";
import { NotifyMeDialog } from "./NotifyMeDialog";

type Props = {
  /** Current URL search params as plain object for the filter snapshot */
  filterSnapshot: Record<string, string>;
  /** Human-readable summary of active filters */
  filterSummary: string;
};

export function NotifyMeButton({ filterSnapshot, filterSummary }: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();

  const [showDialog, setShowDialog] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  function handleClick() {
    if (!auth.authenticated) {
      setShowLogin(true);
      return;
    }
    setShowDialog(true);
  }

  function handleLogin() {
    setShowLogin(false);
    setPendingAction({ action: "save_event", payload: {} });
    auth.login();
  }

  function handleRegister() {
    setShowLogin(false);
    setPendingAction({ action: "save_event", payload: {} });
    auth.register();
  }

  return (
    <>
      <button
        type="button"
        className="notify-me-btn"
        onClick={handleClick}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2v1"/><path d="M4 7a4 4 0 0 1 8 0v2.5l1.5 2H2.5l1.5-2V7Z"/><path d="M6 13a2 2 0 0 0 4 0"/></svg>
        {t("notifyMe.button")}
      </button>

      {showDialog && (
        <NotifyMeDialog
          filterSnapshot={filterSnapshot}
          filterSummary={filterSummary}
          onClose={() => setShowDialog(false)}
          onSaved={() => setShowDialog(false)}
        />
      )}

      {showLogin && (
        <LoginPromptDialog
          featureKey="notifyMe"
          onLogin={handleLogin}
          onRegister={handleRegister}
          onClose={() => setShowLogin(false)}
        />
      )}
    </>
  );
}

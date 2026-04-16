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
        <span aria-hidden="true">{"\uD83D\uDD14"}</span>
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

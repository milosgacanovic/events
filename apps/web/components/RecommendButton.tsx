"use client";

import { useState } from "react";

import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { LoginPromptDialog } from "./LoginPromptDialog";
import { RecommendModal } from "./RecommendModal";

type Props = {
  eventId: string;
  eventTitle: string;
};

export function RecommendButton({ eventId, eventTitle }: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();

  const [showModal, setShowModal] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  function handleClick() {
    if (!auth.authenticated) {
      setShowLogin(true);
      return;
    }
    setShowModal(true);
  }

  function handleLogin() {
    setShowLogin(false);
    auth.login();
  }

  function handleRegister() {
    setShowLogin(false);
    auth.register();
  }

  return (
    <>
      <button type="button" className="recommend-btn" onClick={handleClick} title={t("recommend.button")}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
          <path d="M2 4h8l4 4-4 4H2V4z"/>
          <circle cx="5" cy="8" r="1" fill="currentColor" stroke="none"/>
        </svg>
        {t("recommend.button")}
      </button>

      {showModal && (
        <RecommendModal
          eventId={eventId}
          eventTitle={eventTitle}
          onClose={() => setShowModal(false)}
        />
      )}

      {showLogin && (
        <LoginPromptDialog
          featureKey="recommend"
          onLogin={handleLogin}
          onRegister={handleRegister}
          onClose={() => setShowLogin(false)}
        />
      )}
    </>
  );
}

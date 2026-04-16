"use client";

import { useState } from "react";

import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { LoginPromptDialog } from "./LoginPromptDialog";
import { SuggestEditModal } from "./SuggestEditModal";

type Props = {
  targetType: "event" | "organizer";
  targetId: string;
  targetName: string;
};

export function SuggestEditButton({ targetType, targetId, targetName }: Props) {
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
      <button type="button" className="suggest-edit-btn" onClick={handleClick}>
        {t("suggestEdit.button")}
      </button>

      {showModal && (
        <SuggestEditModal
          targetType={targetType}
          targetId={targetId}
          targetName={targetName}
          onClose={() => setShowModal(false)}
        />
      )}

      {showLogin && (
        <LoginPromptDialog
          featureKey="suggestEdit"
          onLogin={handleLogin}
          onRegister={handleRegister}
          onClose={() => setShowLogin(false)}
        />
      )}
    </>
  );
}

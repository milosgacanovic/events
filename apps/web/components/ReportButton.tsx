"use client";

import { useEffect, useState } from "react";

import { fetchJson } from "../lib/api";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { LoginPromptDialog } from "./LoginPromptDialog";
import { ReportModal } from "./ReportModal";

type Props = {
  targetType: "event" | "organizer";
  targetId: string;
};

export function ReportButton({ targetType, targetId }: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();

  const [reported, setReported] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  // Check if user already reported
  useEffect(() => {
    if (!auth.ready || !auth.authenticated) return;
    let active = true;
    (async () => {
      try {
        const token = await auth.getToken();
        if (!token || !active) return;
        const res = await fetchJson<{ reported: boolean }>(
          `/reports/status?targetType=${targetType}&targetId=${targetId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (active) setReported(res.reported);
      } catch {
        // soft fail
      }
    })();
    return () => { active = false; };
  }, [auth.ready, auth.authenticated, auth.getToken, targetType, targetId]);

  function handleClick() {
    if (reported) return;
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
      <button
        type="button"
        className={`report-btn${reported ? " report-btn--reported" : ""}`}
        onClick={handleClick}
        disabled={reported}
      >
        {reported ? t("report.alreadyReported") : t("report.button")}
      </button>

      {showModal && (
        <ReportModal
          targetType={targetType}
          targetId={targetId}
          onClose={() => setShowModal(false)}
          onReported={() => setReported(true)}
        />
      )}

      {showLogin && (
        <LoginPromptDialog
          featureKey="report"
          onLogin={handleLogin}
          onRegister={handleRegister}
          onClose={() => setShowLogin(false)}
        />
      )}
    </>
  );
}

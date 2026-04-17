"use client";

import { useEffect, useState } from "react";

import { fetchJson } from "../lib/api";
import { setPendingAction } from "../lib/pendingAction";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { LoginPromptDialog } from "./LoginPromptDialog";
import { FollowHostModal, type ExistingAlert, type ProfileDefaults } from "./FollowHostModal";

type Props = {
  organizerId: string;
  organizerName: string;
};

export function FollowHostButton({ organizerId, organizerName }: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();

  const [existing, setExisting] = useState<ExistingAlert | null>(null);
  const [profileDefaults, setProfileDefaults] = useState<ProfileDefaults | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!auth.ready || !auth.authenticated) {
      setExisting(null);
      setProfileDefaults(null);
      setLoaded(true);
      return;
    }
    let active = true;
    (async () => {
      const token = await auth.getToken();
      if (!token || !active) return;
      try {
        const [alertResponse, profileResponse] = await Promise.all([
          fetchJson<{ alert: ExistingAlert | null }>(
            `/profile/alerts/for-organizer/${organizerId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          ),
          fetchJson<ProfileDefaults>(`/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (!active) return;
        setExisting(alertResponse.alert);
        setProfileDefaults(profileResponse);
      } catch {
        // Soft-fail — button still renders Follow, modal just won't pre-fill.
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [auth.ready, auth.authenticated, auth.getToken, organizerId]);

  useEffect(() => {
    function onPendingFollow(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.organizerId === organizerId) {
        setOpen(true);
      }
    }
    window.addEventListener("dr:pending-follow", onPendingFollow);
    return () => window.removeEventListener("dr:pending-follow", onPendingFollow);
  }, [organizerId]);

  function handleClick() {
    if (!auth.authenticated) {
      setShowLogin(true);
      return;
    }
    setOpen(true);
  }

  function handleLogin() {
    setShowLogin(false);
    setPendingAction({ action: "follow_host", payload: { organizerId, organizerName } });
    auth.login();
  }

  function handleRegister() {
    setShowLogin(false);
    setPendingAction({ action: "follow_host", payload: { organizerId, organizerName } });
    auth.register();
  }

  const followingLabel = existing?.locationLabel
    ? t("follow.button.followingNear", { location: existing.locationLabel })
    : t("follow.button.following");

  return (
    <>
      <button
        type="button"
        className={existing ? "secondary-btn follow-button follow-button--following" : "primary-btn follow-button"}
        onClick={handleClick}
        title={!auth.authenticated ? t("follow.button.signInTooltip") : undefined}
        disabled={!loaded}
      >
        {auth.authenticated && existing ? (
          <>
            <span aria-hidden="true">{"\u2713"}</span>
            {followingLabel}
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2v1"/><path d="M4 7a4 4 0 0 1 8 0v2.5l1.5 2H2.5l1.5-2V7Z"/><path d="M6 13a2 2 0 0 0 4 0"/></svg>
            {t("follow.button.follow")}
          </>
        )}
      </button>

      {open && (
        <FollowHostModal
          organizerId={organizerId}
          organizerName={organizerName}
          existing={existing}
          profileDefaults={profileDefaults}
          onClose={() => setOpen(false)}
          onSaved={(saved) => setExisting(saved)}
          onDeleted={() => setExisting(null)}
        />
      )}

      {showLogin && (
        <LoginPromptDialog
          featureKey="follow"
          entityName={organizerName}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onClose={() => setShowLogin(false)}
        />
      )}
    </>
  );
}

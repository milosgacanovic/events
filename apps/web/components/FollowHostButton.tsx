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

/**
 * Compact button that lives on a host page header. Three visual states:
 *  - Not authenticated → shows LoginPromptDialog explaining Follow value
 *  - Authenticated, no alert → "🔔 Follow" (primary) → opens FollowHostModal
 *  - Authenticated, has alert → "✓ Following" (secondary) → reopens modal in Edit mode
 *
 * After login via the dialog, PendingActionExecutor dispatches a "dr:pending-follow"
 * custom event, which this component listens for to auto-open the modal.
 */
export function FollowHostButton({ organizerId, organizerName }: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();

  const [existing, setExisting] = useState<ExistingAlert | null>(null);
  const [profileDefaults, setProfileDefaults] = useState<ProfileDefaults | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  // Fetch alert + profile defaults once we have a token
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

  // Listen for pending-follow custom event from PendingActionExecutor
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
            <span aria-hidden="true">{"\u2713"} </span>
            {followingLabel}
          </>
        ) : (
          <>
            <span aria-hidden="true">{"\uD83D\uDD14"} </span>
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

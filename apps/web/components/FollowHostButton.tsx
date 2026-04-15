"use client";

import { useEffect, useState } from "react";

import { apiBase, fetchJson } from "../lib/api";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { FollowHostModal, type ExistingAlert, type ProfileDefaults } from "./FollowHostModal";

type Props = {
  organizerId: string;
  organizerName: string;
};

/**
 * Compact button that lives on a host page header. Three visual states:
 *  - Not authenticated → disabled "🔔 Follow" with tooltip; click triggers Keycloak login
 *  - Authenticated, no alert → "🔔 Follow" (primary)
 *  - Authenticated, has alert → "✓ Following" (secondary) — click reopens the modal in
 *    Edit mode so the user can change radius / location / unfollow
 *
 * Profile defaults are fetched alongside the alert lookup so the modal can pre-fill on
 * first follow without a second round-trip when the user actually clicks.
 */
export function FollowHostButton({ organizerId, organizerName }: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();

  const [existing, setExisting] = useState<ExistingAlert | null>(null);
  const [profileDefaults, setProfileDefaults] = useState<ProfileDefaults | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  // Fetch alert + profile defaults once we have a token. Re-runs if auth state flips
  // (e.g. user logs in via the disabled-button click path).
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
    return () => {
      active = false;
    };
  }, [auth.ready, auth.authenticated, auth.getToken, organizerId]);

  function handleClick() {
    if (!auth.authenticated) {
      void auth.login();
      return;
    }
    setOpen(true);
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
            <span aria-hidden="true">✓ </span>
            {followingLabel}
          </>
        ) : (
          <>
            <span aria-hidden="true">🔔 </span>
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
    </>
  );
}

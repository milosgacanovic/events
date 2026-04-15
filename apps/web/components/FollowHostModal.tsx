"use client";

import { useEffect, useState } from "react";

import { apiBase } from "../lib/api";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { CityAutocomplete, type CitySelection } from "./CityAutocomplete";

const RADIUS_OPTIONS = [50, 100, 300, 500, 1000];

/**
 * Shape returned by `GET /profile/alerts/for-organizer/:id` and accepted by callers
 * who want to pre-fill the modal with an existing alert (Edit flow).
 */
export type ExistingAlert = {
  id: string;
  organizerId: string;
  radiusKm: number;
  lat: number | null;
  lng: number | null;
  locationLabel: string | null;
  city: string | null;
  countryCode: string | null;
};

/**
 * Profile values used to pre-fill the form on first-time follow. Comes from
 * `GET /profile`. Optional — modal still works without it (user just types fresh).
 */
export type ProfileDefaults = {
  homeLat: number | null;
  homeLng: number | null;
  homeLocationLabel: string | null;
  homeCity: string | null;
  homeCountryCode: string | null;
  defaultRadiusKm: number | null;
};

type Props = {
  organizerId: string;
  organizerName: string;
  existing: ExistingAlert | null;
  profileDefaults: ProfileDefaults | null;
  onClose: () => void;
  onSaved: (alert: ExistingAlert) => void;
  onDeleted: () => void;
};

/**
 * Modal that creates/edits/deletes a Follow alert for one host. Pre-fill order:
 * existing alert → profile home location → empty (Anywhere). Submit hits POST or
 * PATCH depending on `existing`. Delete hits DELETE.
 *
 * The "Anywhere" mode (no city selected) intentionally still works — users may want
 * to be notified about every new event from a host regardless of where they live.
 */
export function FollowHostModal({
  organizerId,
  organizerName,
  existing,
  profileDefaults,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const { t } = useI18n();
  const auth = useKeycloakAuth();

  const initialCity: CitySelection | null = (() => {
    if (existing?.lat != null && existing?.lng != null) {
      return {
        label: existing.locationLabel ?? "",
        city: existing.city ?? "",
        countryCode: existing.countryCode,
        lat: existing.lat,
        lng: existing.lng,
      };
    }
    if (profileDefaults?.homeLat != null && profileDefaults?.homeLng != null) {
      return {
        label: profileDefaults.homeLocationLabel ?? "",
        city: profileDefaults.homeCity ?? "",
        countryCode: profileDefaults.homeCountryCode,
        lat: profileDefaults.homeLat,
        lng: profileDefaults.homeLng,
      };
    }
    return null;
  })();

  const initialRadius =
    existing?.radiusKm ??
    profileDefaults?.defaultRadiusKm ??
    100;

  const [city, setCity] = useState<CitySelection | null>(initialCity);
  const [radiusKm, setRadiusKm] = useState<number>(initialRadius);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape — keeps the modal feeling like a real dialog without pulling in
  // a dialog primitive. Click-on-backdrop also closes (handled in the JSX).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const token = await auth.getToken();
      if (!token) throw new Error("missing_token");
      const body = {
        organizerId,
        radiusKm,
        lat: city?.lat ?? null,
        lng: city?.lng ?? null,
        locationLabel: city?.label ?? null,
        city: city?.city ?? null,
        countryCode: city?.countryCode ?? null,
      };
      const url = existing ? `${apiBase}/profile/alerts/${existing.id}` : `${apiBase}/profile/alerts`;
      const method = existing ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`alert_save_failed_${response.status}`);
      const saved = (await response.json()) as ExistingAlert;
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "alert_save_failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    setDeleting(true);
    setError(null);
    try {
      const token = await auth.getToken();
      if (!token) throw new Error("missing_token");
      const response = await fetch(`${apiBase}/profile/alerts/${existing.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`alert_delete_failed_${response.status}`);
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "alert_delete_failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="follow-host-modal-title">
        <div className="modal-header">
          <h2 id="follow-host-modal-title" className="modal-title">
            {existing
              ? t("follow.modal.titleEdit", { host: organizerName })
              : t("follow.modal.titleCreate", { host: organizerName })}
          </h2>
          <button type="button" className="modal-close" aria-label={t("common.close")} onClick={onClose}>
            ×
          </button>
        </div>

        <p className="modal-description">{t("follow.modal.description")}</p>

        <div className="modal-field">
          <label htmlFor="follow-host-city" className="modal-label">
            {t("follow.modal.locationLabel")}
          </label>
          <CityAutocomplete
            inputId="follow-host-city"
            value={city}
            onChange={setCity}
            placeholder={t("follow.modal.locationPlaceholder")}
          />
          <div className="modal-help">{t("follow.modal.locationHelp")}</div>
        </div>

        <div className="modal-field">
          <label htmlFor="follow-host-radius" className="modal-label">
            {t("follow.modal.radiusLabel")}
          </label>
          <select
            id="follow-host-radius"
            className="modal-select"
            value={radiusKm}
            disabled={!city}
            onChange={(event) => setRadiusKm(Number(event.target.value))}
          >
            {RADIUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t("follow.modal.radiusOption", { km: option })}
              </option>
            ))}
          </select>
          {!city && <div className="modal-help">{t("follow.modal.radiusDisabled")}</div>}
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          {existing && (
            <button
              type="button"
              className="secondary-btn modal-action-danger"
              onClick={() => void handleDelete()}
              disabled={deleting || saving}
            >
              {deleting ? t("follow.modal.unfollowing") : t("follow.modal.unfollow")}
            </button>
          )}
          <div className="modal-action-spacer" />
          <button type="button" className="secondary-btn" onClick={onClose} disabled={saving || deleting}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => void handleSubmit()}
            disabled={saving || deleting}
          >
            {saving
              ? t("follow.modal.saving")
              : existing
                ? t("follow.modal.save")
                : t("follow.modal.follow")}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { LocaleSwitcher } from "../../../components/i18n/LocaleSwitcher";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { CityAutocomplete, type CitySelection } from "../../../components/CityAutocomplete";
import { apiBase } from "../../../lib/api";
import { getUserTimeZone, readTimeDisplayMode, writeTimeDisplayMode } from "../../../lib/timeDisplay";

const RADIUS_OPTIONS = [50, 100, 300, 500, 1000];

type ProfilePayload = {
  id: string;
  keycloakSub: string;
  displayName: string | null;
  email: string | null;
  homeCountryCode: string | null;
  homeCity: string | null;
  homeLat: number | null;
  homeLng: number | null;
  homeLocationLabel: string | null;
  defaultRadiusKm: number | null;
  createdAt: string;
};

export default function AccountTab() {
  const auth = useKeycloakAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingHome, setSavingHome] = useState(false);
  const [homeStatus, setHomeStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [homeCity, setHomeCity] = useState<CitySelection | null>(null);
  const [defaultRadiusKm, setDefaultRadiusKm] = useState<number>(100);
  const [timeDisplayMode, setTimeDisplayMode] = useState<"event" | "user">(() => readTimeDisplayMode());
  const [userTimeZone] = useState(() => (typeof window !== "undefined" ? getUserTimeZone() : "UTC"));
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth.getToken();
      if (!token) return;
      const res = await fetch(`${apiBase}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`profile_load_failed_${res.status}`);
      const p = (await res.json()) as ProfilePayload;
      setProfile(p);
      setDisplayName(p.displayName ?? "");
      setDefaultRadiusKm(p.defaultRadiusKm ?? 100);
      if (p.homeLat != null && p.homeLng != null) {
        setHomeCity({
          label: p.homeLocationLabel ?? "",
          city: p.homeCity ?? "",
          countryCode: p.homeCountryCode,
          lat: p.homeLat,
          lng: p.homeLng,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.error.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [auth.getToken, t]);

  useEffect(() => { void load(); }, [load]);

  async function saveProfile() {
    setSaving(true);
    setError(null);
    try {
      const token = await auth.getToken();
      if (!token) throw new Error("missing_token");
      const res = await fetch(`${apiBase}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ displayName: displayName.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`profile_save_failed_${res.status}`);
      const p = (await res.json()) as ProfilePayload;
      setProfile(p);
      setDisplayName(p.displayName ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("profile.error.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function saveHomeLocation() {
    setSavingHome(true);
    setHomeStatus(null);
    try {
      const token = await auth.getToken();
      if (!token) throw new Error("missing_token");
      const body = {
        homeCity: homeCity?.city ?? null,
        homeCountryCode: homeCity?.countryCode ?? null,
        homeLat: homeCity?.lat ?? null,
        homeLng: homeCity?.lng ?? null,
        homeLocationLabel: homeCity?.label ?? null,
        defaultRadiusKm,
      };
      const res = await fetch(`${apiBase}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`profile_save_failed_${res.status}`);
      const p = (await res.json()) as ProfilePayload;
      setProfile(p);
      setHomeStatus(t("profile.homeLocation.saved"));
    } catch (err) {
      setHomeStatus(err instanceof Error ? err.message : t("profile.error.saveFailed"));
    } finally {
      setSavingHome(false);
    }
  }

  if (loading) return <p className="muted">{t("profile.loading")}</p>;

  return (
    <div>
      {error && <div className="muted">{error}</div>}

      <LocaleSwitcher />

      <label>
        {t("profile.displayName")}
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <div className="meta">
        {t("profile.username")} {profile?.email ?? auth.userName ?? t("common.none")}
        <span style={{ marginLeft: 8, fontSize: "0.75rem", opacity: 0.7 }}>({t("profile.managedBySSO")})</span>
      </div>
      <label className="toggle-control">
        <input
          className="toggle-control-input"
          type="checkbox"
          checked={timeDisplayMode === "event"}
          onChange={(e) => {
            const next = e.target.checked ? "event" : "user";
            setTimeDisplayMode(next);
            writeTimeDisplayMode(next);
          }}
        />
        <span className="toggle-control-track" aria-hidden />
        <span className="meta">
          {timeDisplayMode === "event"
            ? t("profile.timeMode.eventWithZone", { zone: t("common.eventTimezone") })
            : t("profile.timeMode.userWithZone", { zone: userTimeZone })}
        </span>
      </label>
      <button className="secondary-btn" type="button" onClick={() => void saveProfile()} disabled={saving}>
        {saving ? t("profile.saving") : t("profile.save")}
      </button>

      <hr />

      <h2 className="title-l">{t("profile.homeLocation.title")}</h2>
      <p className="muted">{t("profile.homeLocation.description")}</p>
      <div className="modal-field">
        <label className="modal-label" htmlFor="profile-home-city">
          {t("profile.homeLocation.cityLabel")}
        </label>
        <CityAutocomplete
          inputId="profile-home-city"
          value={homeCity}
          onChange={setHomeCity}
          placeholder={t("profile.homeLocation.cityPlaceholder")}
        />
      </div>
      <div className="modal-field">
        <label className="modal-label" htmlFor="profile-default-radius">
          {t("profile.homeLocation.radiusLabel")}
        </label>
        <select
          id="profile-default-radius"
          className="modal-select"
          value={defaultRadiusKm}
          onChange={(e) => setDefaultRadiusKm(Number(e.target.value))}
        >
          {RADIUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {t("profile.homeLocation.radiusOption", { km: opt })}
            </option>
          ))}
        </select>
      </div>
      <button className="secondary-btn" type="button" onClick={() => void saveHomeLocation()} disabled={savingHome}>
        {savingHome ? t("profile.saving") : t("profile.homeLocation.save")}
      </button>
      {homeStatus && <div className="meta">{homeStatus}</div>}

      <div style={{ marginTop: 24, padding: 16, border: "1px solid var(--danger, #dc2626)", borderRadius: 8 }}>
        <h3 style={{ margin: "0 0 8px", color: "var(--danger, #dc2626)" }}>{t("profile.dangerZone")}</h3>
        <p className="meta" style={{ marginBottom: 12 }}>{t("profile.deleteAccountWarning")}</p>
        <button
          type="button"
          className="report-btn"
          onClick={() => { setDeleteConfirm(""); deleteDialogRef.current?.showModal(); }}
        >
          {t("profile.deleteAccount")}
        </button>
      </div>

      <dialog ref={deleteDialogRef} className="manage-dialog">
        <h3>{t("profile.deleteAccount")}</h3>
        <p className="meta">{t("profile.deleteAccountConfirm", { username: profile?.displayName ?? auth.userName ?? "" })}</p>
        <input
          type="text"
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          placeholder={profile?.displayName ?? auth.userName ?? ""}
          style={{ width: "100%", marginBottom: 12 }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="secondary-btn" onClick={() => deleteDialogRef.current?.close()}>
            {t("manage.common.cancel")}
          </button>
          <a
            href={`${process.env.NEXT_PUBLIC_KEYCLOAK_URL || "https://sso.danceresource.org"}/realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "danceresource"}/account/#/security/signingin`}
            target="_blank"
            rel="noopener noreferrer"
            className={`report-btn${deleteConfirm !== (profile?.displayName ?? auth.userName ?? "") ? " disabled" : ""}`}
            style={deleteConfirm !== (profile?.displayName ?? auth.userName ?? "") ? { pointerEvents: "none", opacity: 0.5 } : {}}
            onClick={() => deleteDialogRef.current?.close()}
          >
            {t("profile.deleteAccount")}
          </a>
        </div>
      </dialog>
    </div>
  );
}

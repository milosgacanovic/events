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

  const displayNameForAvatar = displayName || profile?.email || auth.userEmail || "";
  const initial = (displayNameForAvatar || "?")[0].toUpperCase();
  const usernameDisplay = profile?.email ?? auth.userName ?? t("common.none");

  const sectionStyle: React.CSSProperties = { marginBottom: 32 };
  const fieldColumnStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };

  return (
    <div>
      {error && <div className="muted" style={{ color: "var(--danger, #dc2626)", marginBottom: 12 }}>{error}</div>}

      {/* Profile section */}
      <section style={sectionStyle}>
        <h2 className="title-m" style={{ marginTop: 0, marginBottom: 12 }}>{t("profile.account.profileSection")}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "var(--accent-bg)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.4rem", fontWeight: 600, color: "var(--accent)", flexShrink: 0,
          }}>
            {initial}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{displayNameForAvatar}</div>
            <div className="meta" style={{ fontSize: "0.8rem" }}>
              {usernameDisplay}
              <span style={{ marginLeft: 8, opacity: 0.7 }}>({t("profile.managedBySSO")})</span>
            </div>
          </div>
        </div>
        <div style={fieldColumnStyle}>
          <div className="modal-field">
            <label className="modal-label" htmlFor="profile-display-name">{t("profile.displayName")}</label>
            <input
              id="profile-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{ width: "100%", maxWidth: 360 }}
            />
          </div>
          <div>
            <button className="secondary-btn" type="button" onClick={() => void saveProfile()} disabled={saving}>
              {saving ? t("profile.saving") : t("profile.save")}
            </button>
          </div>
        </div>
      </section>

      {/* Language section */}
      <section style={sectionStyle}>
        <h2 className="title-m" style={{ marginTop: 0, marginBottom: 12 }}>{t("profile.account.languageSection")}</h2>
        <LocaleSwitcher />
      </section>

      {/* Time display section */}
      <section style={sectionStyle}>
        <h2 className="title-m" style={{ marginTop: 0, marginBottom: 12 }}>{t("profile.account.timeSection")}</h2>
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
      </section>

      {/* Home location section */}
      <section style={sectionStyle}>
        <h2 className="title-m" style={{ marginTop: 0, marginBottom: 8 }}>{t("profile.homeLocation.title")}</h2>
        <p className="muted" style={{ marginTop: 0, marginBottom: 12, fontSize: "0.85rem" }}>{t("profile.homeLocation.description")}</p>
        <div style={fieldColumnStyle}>
          <div className="modal-field">
            <label className="modal-label" htmlFor="profile-home-city">{t("profile.homeLocation.cityLabel")}</label>
            <CityAutocomplete
              inputId="profile-home-city"
              value={homeCity}
              onChange={setHomeCity}
              placeholder={t("profile.homeLocation.cityPlaceholder")}
            />
          </div>
          <div className="modal-field">
            <label className="modal-label" htmlFor="profile-default-radius">{t("profile.homeLocation.radiusLabel")}</label>
            <select
              id="profile-default-radius"
              className="modal-select"
              value={defaultRadiusKm}
              onChange={(e) => setDefaultRadiusKm(Number(e.target.value))}
              style={{ maxWidth: 200 }}
            >
              {RADIUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{t("profile.homeLocation.radiusOption", { km: opt })}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="secondary-btn" type="button" onClick={() => void saveHomeLocation()} disabled={savingHome}>
              {savingHome ? t("profile.saving") : t("profile.homeLocation.save")}
            </button>
            {homeStatus && <span className="meta" style={{ color: "var(--success, #16a34a)" }}>{homeStatus}</span>}
          </div>
        </div>
      </section>

      {/* Danger zone */}
      <section style={{ ...sectionStyle, padding: 16, border: "1px solid var(--danger, #dc2626)", borderRadius: 8 }}>
        <h2 className="title-m" style={{ margin: "0 0 8px", color: "var(--danger, #dc2626)" }}>{t("profile.dangerZone")}</h2>
        <p className="meta" style={{ marginBottom: 12 }}>{t("profile.deleteAccountWarning")}</p>
        <button
          type="button"
          className="report-btn"
          onClick={() => { setDeleteConfirm(""); deleteDialogRef.current?.showModal(); }}
        >
          {t("profile.deleteAccount")}
        </button>
      </section>

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

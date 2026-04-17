"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { apiBase } from "../../../lib/api";

type NotifPrefs = {
  emailEnabled: boolean;
  digestFrequency: string;
  pauseUntil: string | null;
  notifyFollowedHosts: boolean;
  notifySavedReminders: boolean;
  notifyRsvpReminders: boolean;
  notifyEventUpdates: boolean;
  notifySearchAlerts: boolean;
};

export default function NotificationsTab() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();

  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${apiBase}/profile/notification-preferences`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) setPrefs(await res.json() as NotifPrefs);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  async function savePrefs() {
    if (!prefs) return;
    setPrefsSaving(true);
    setPrefsMsg(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${apiBase}/profile/notification-preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        const updated = (await res.json()) as NotifPrefs;
        setPrefs(updated);
        setPrefsMsg(t("profile.emailPrefs.saved"));
      }
    } finally {
      setPrefsSaving(false);
    }
  }

  if (loading) return <p className="muted">{t("profile.loading")}</p>;
  if (!prefs) return <p className="muted">{t("profile.loading")}</p>;

  const disabled = !prefs.emailEnabled;

  return (
    <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 8 }}>
      <h3 className="title-s" style={{ marginTop: 0, marginBottom: 12 }}>{t("profile.emailPrefs.title")}</h3>

      <label className="toggle-control" style={{ marginBottom: 8 }}>
        <input
          className="toggle-control-input"
          type="checkbox"
          checked={prefs.emailEnabled}
          onChange={(e) => setPrefs({ ...prefs, emailEnabled: e.target.checked })}
        />
        <span className="toggle-control-track" aria-hidden />
        <span>{t("profile.emailPrefs.masterToggle")}</span>
      </label>
      {!prefs.emailEnabled && (
        <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 12 }}>{t("profile.emailPrefs.masterOff")}</p>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20, opacity: disabled ? 0.5 : 1 }}>
        <div className="modal-field" style={{ flex: 1, minWidth: 160 }}>
          <label className="modal-label">{t("profile.emailPrefs.frequency")}</label>
          <select
            className="modal-select"
            value={prefs.digestFrequency}
            disabled={disabled}
            onChange={(e) => setPrefs({ ...prefs, digestFrequency: e.target.value })}
          >
            <option value="weekly">{t("profile.emailPrefs.weekly")}</option>
            <option value="daily">{t("profile.emailPrefs.daily")}</option>
          </select>
        </div>
        <div className="modal-field" style={{ flex: 1, minWidth: 160 }}>
          <label className="modal-label">{t("profile.emailPrefs.pauseUntil")}</label>
          <input
            type="date"
            value={prefs.pauseUntil ?? ""}
            disabled={disabled}
            onChange={(e) => setPrefs({ ...prefs, pauseUntil: e.target.value || null })}
            style={{ width: "100%" }}
          />
          <div className="meta" style={{ fontSize: "0.7rem" }}>{t("profile.emailPrefs.pauseUntilHelp")}</div>
        </div>
      </div>

      <div style={{ marginBottom: 20, opacity: disabled ? 0.5 : 1 }}>
        <div className="meta" style={{ fontWeight: 600, marginBottom: 12 }}>{t("profile.emailPrefs.categories")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {([
            { key: "notifyFollowedHosts" as const, label: t("profile.emailPrefs.followedHosts") },
            { key: "notifySavedReminders" as const, label: t("profile.emailPrefs.savedReminders") },
            { key: "notifyRsvpReminders" as const, label: t("profile.emailPrefs.rsvpReminders") },
            { key: "notifyEventUpdates" as const, label: t("profile.emailPrefs.eventUpdates") },
            { key: "notifySearchAlerts" as const, label: t("profile.emailPrefs.searchAlerts") },
          ]).map((cat) => (
            <label key={cat.key} className="toggle-control">
              <input
                className="toggle-control-input"
                type="checkbox"
                checked={prefs[cat.key]}
                disabled={disabled}
                onChange={(e) => setPrefs({ ...prefs, [cat.key]: e.target.checked })}
              />
              <span className="toggle-control-track" aria-hidden />
              <span className="meta">{cat.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="secondary-btn" type="button" onClick={() => void savePrefs()} disabled={prefsSaving}>
          {prefsSaving ? t("profile.saving") : t("profile.emailPrefs.save")}
        </button>
        {prefsMsg && <span className="meta" style={{ color: "var(--success, #16a34a)" }}>{prefsMsg}</span>}
      </div>
    </div>
  );
}

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

type SavedSearchItem = {
  id: string;
  label: string | null;
  filterSnapshot: Record<string, unknown>;
  frequency: string;
  notifyNew: boolean;
  notifyReminders: boolean;
  notifyUpdates: boolean;
  unsubscribedAt: string | null;
  createdAt: string;
};

export default function NotificationsTab() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();

  // Email prefs state
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);

  // Search alerts state
  const [items, setItems] = useState<SavedSearchItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const [prefsRes, alertsRes] = await Promise.all([
        fetch(`${apiBase}/profile/notification-preferences`, { headers, cache: "no-store" }),
        fetch(`${apiBase}/profile/saved-searches`, { headers, cache: "no-store" }),
      ]);
      if (prefsRes.ok) setPrefs(await prefsRes.json() as NotifPrefs);
      if (alertsRes.ok) {
        const data = (await alertsRes.json()) as { items: SavedSearchItem[] };
        setItems(data.items);
      }
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

  async function updateSearch(id: string, patch: Record<string, unknown>) {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${apiBase}/profile/saved-searches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = (await res.json()) as SavedSearchItem;
      setItems((cur) => cur.map((i) => (i.id === id ? updated : i)));
    }
  }

  async function removeSearch(id: string) {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${apiBase}/profile/saved-searches/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setItems((cur) => cur.filter((i) => i.id !== id));
  }

  if (loading) return <p className="muted">{t("profile.loading")}</p>;

  const disabled = prefs ? !prefs.emailEnabled : false;

  return (
    <>
      {/* Section A: Email Preferences */}
      {prefs && (
        <div style={{ marginBottom: 24, padding: 16, border: "1px solid var(--border)", borderRadius: 8 }}>
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

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12, opacity: disabled ? 0.5 : 1 }}>
            <div className="modal-field" style={{ flex: 1, minWidth: 140 }}>
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
            <div className="modal-field" style={{ flex: 1, minWidth: 140 }}>
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

          <div style={{ marginBottom: 12, opacity: disabled ? 0.5 : 1 }}>
            <div className="meta" style={{ fontWeight: 600, marginBottom: 8 }}>{t("profile.emailPrefs.categories")}</div>
            {([
              { key: "notifyFollowedHosts" as const, label: t("profile.emailPrefs.followedHosts") },
              { key: "notifySavedReminders" as const, label: t("profile.emailPrefs.savedReminders") },
              { key: "notifyRsvpReminders" as const, label: t("profile.emailPrefs.rsvpReminders") },
              { key: "notifyEventUpdates" as const, label: t("profile.emailPrefs.eventUpdates") },
              { key: "notifySearchAlerts" as const, label: t("profile.emailPrefs.searchAlerts") },
            ]).map((cat) => (
              <label key={cat.key} className="toggle-control" style={{ marginBottom: 4 }}>
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

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="secondary-btn" type="button" onClick={() => void savePrefs()} disabled={prefsSaving}>
              {prefsSaving ? t("profile.saving") : t("profile.emailPrefs.save")}
            </button>
            {prefsMsg && <span className="meta" style={{ color: "var(--success, #16a34a)" }}>{prefsMsg}</span>}
          </div>
        </div>
      )}

      {/* Section B: Search Alerts */}
      <h3 className="title-s" style={{ marginBottom: 12 }}>{t("profile.emailPrefs.searchAlertsTitle")}</h3>

      {items.length === 0 ? (
        <p className="muted">{t("profile.savedSearches.empty")}</p>
      ) : (
        <ul className="alerts-list">
          {items.map((search) => (
            <li key={search.id} className="alerts-item">
              <div className="alerts-item-main" style={{ flex: 1 }}>
                <div className="alerts-item-host">
                  {search.label || t("profile.savedSearches.untitled")}
                </div>
                <div className="meta" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                  <select
                    className="modal-select"
                    style={{ width: "auto", fontSize: "0.8rem", padding: "2px 6px" }}
                    value={search.frequency}
                    onChange={(e) => void updateSearch(search.id, { frequency: e.target.value })}
                  >
                    <option value="weekly">{t("notifyMe.dialog.weekly")}</option>
                    <option value="daily">{t("notifyMe.dialog.daily")}</option>
                  </select>
                  {search.unsubscribedAt && (
                    <span className="profile-comment-status profile-comment-status--rejected">
                      {t("profile.savedSearches.paused")}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                  <label className="toggle-control toggle-control-sm">
                    <input
                      className="toggle-control-input"
                      type="checkbox"
                      checked={search.notifyReminders}
                      onChange={(e) => void updateSearch(search.id, { notifyReminders: e.target.checked })}
                    />
                    <span className="toggle-control-track" aria-hidden />
                    <span className="meta">{t("profile.savedSearches.reminders")}</span>
                  </label>
                  <label className="toggle-control toggle-control-sm">
                    <input
                      className="toggle-control-input"
                      type="checkbox"
                      checked={search.notifyUpdates}
                      onChange={(e) => void updateSearch(search.id, { notifyUpdates: e.target.checked })}
                    />
                    <span className="toggle-control-track" aria-hidden />
                    <span className="meta">{t("profile.savedSearches.updates")}</span>
                  </label>
                </div>
              </div>
              <div className="alerts-item-actions" style={{ display: "flex", gap: 6, flexDirection: "column" }}>
                <button className="secondary-btn" type="button" onClick={() => void updateSearch(search.id, { paused: !search.unsubscribedAt })}>
                  {search.unsubscribedAt ? t("profile.savedSearches.resume") : t("profile.savedSearches.pause")}
                </button>
                <button className="secondary-btn" type="button" onClick={() => void removeSearch(search.id)}>
                  {t("profile.savedSearches.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

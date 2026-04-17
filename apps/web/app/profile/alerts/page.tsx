"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { apiBase } from "../../../lib/api";

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

export default function SearchAlertsTab() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();

  const [items, setItems] = useState<SavedSearchItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${apiBase}/profile/saved-searches`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { items: SavedSearchItem[] };
        setItems(data.items);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

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

  return (
    <>
      <h3 className="title-s" style={{ marginBottom: 12 }}>{t("profile.savedSearches.title")}</h3>
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

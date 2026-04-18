"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  function labelKey(k: string): string {
    const translated = t(`profile.savedSearches.filterKey.${k}`);
    return translated.startsWith("profile.savedSearches.filterKey.") ? k : translated;
  }

  function formatValue(key: string, val: string): string {
    if (key === "countryCode") {
      try {
        const dn = new Intl.DisplayNames([navigator.language || "en"], { type: "region" });
        return val.split(",").map((c) => dn.of(c.trim().toUpperCase()) ?? c).join(", ");
      } catch {
        return val.toUpperCase();
      }
    }
    const parts = val.split(",");
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (parts.length > 0 && parts.every((p) => uuidRe.test(p.trim()))) {
      return `${parts.length} ${t("profile.savedSearches.selected")}`;
    }
    return val.length > 60 ? `${val.slice(0, 60)}…` : val;
  }

  function buildFilterSummary(snap: Record<string, unknown>): { text: string; href: string } {
    const entries = Object.entries(snap).filter(([k, v]) => v != null && String(v).length > 0 && k !== "page" && k !== "view" && k !== "sort");
    const params = new URLSearchParams();
    for (const [k, v] of entries) params.set(k, String(v));
    const href = `/events${params.toString() ? `?${params.toString()}` : ""}`;

    if (entries.length === 0) return { text: t("profile.savedSearches.allEvents"), href };

    const parts: string[] = [];
    const q = snap["q"];
    if (typeof q === "string" && q.length > 0) parts.push(`"${q}"`);
    for (const [k, v] of entries) {
      if (k === "q") continue;
      parts.push(`${labelKey(k)}: ${formatValue(k, String(v))}`);
    }
    return { text: parts.join(" · "), href };
  }

  return (
    <>
      {items.length === 0 ? (
        <p className="muted">{t("profile.savedSearches.empty")}</p>
      ) : (
        <ul className="alerts-list">
          {items.map((search) => {
            const summary = buildFilterSummary(search.filterSnapshot);
            const title = search.label || summary.text;
            return (
              <li key={search.id} className="alerts-item">
                <div className="alerts-item-main" style={{ flex: 1 }}>
                  <a href={summary.href} className="alerts-item-title">
                    {title}
                  </a>
                  <div className="alerts-item-controls-row">
                    <select
                      className="modal-select"
                      style={{ width: "auto", fontSize: "0.9rem", padding: "4px 8px" }}
                      value={search.frequency}
                      onChange={(e) => void updateSearch(search.id, { frequency: e.target.value })}
                    >
                      <option value="weekly">{t("notifyMe.dialog.weekly")}</option>
                      <option value="daily">{t("notifyMe.dialog.daily")}</option>
                    </select>
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
                    {search.unsubscribedAt && (
                      <span className="profile-comment-status profile-comment-status--rejected">
                        {t("profile.savedSearches.paused")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="alerts-item-actions" style={{ display: "flex", gap: 6, flexDirection: "column" }}>
                  <button className="primary-btn" type="button" onClick={() => void updateSearch(search.id, { paused: !search.unsubscribedAt })}>
                    {search.unsubscribedAt ? t("profile.savedSearches.resume") : t("profile.savedSearches.pause")}
                  </button>
                  <button className="primary-btn" type="button" onClick={() => setConfirmDeleteId(search.id)}>
                    {t("profile.savedSearches.delete")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {confirmDeleteId && (
        <ConfirmDialog
          title={t("profile.savedSearches.confirmDeleteTitle")}
          message={t("profile.savedSearches.confirmDeleteBody")}
          confirmLabel={t("profile.savedSearches.delete")}
          danger
          onConfirm={() => void removeSearch(confirmDeleteId)}
          onClose={() => setConfirmDeleteId(null)}
        />
      )}
    </>
  );
}

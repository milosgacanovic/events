"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { apiBase, fetchJson } from "../../../lib/api";
import type { TaxonomyResponse } from "../../../components/EventSearchClient";

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

const KNOWN_EVENT_DATE_PRESETS = new Set([
  "today", "tomorrow", "this_weekend", "this_week",
  "next_weekend", "next_week", "this_month", "next_month",
  "upcoming", "next_7_days", "next_30_days", "past",
]);

export default function SearchAlertsTab() {
  const { getToken } = useKeycloakAuth();
  const { t, locale } = useI18n();

  const [items, setItems] = useState<SavedSearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);

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

  useEffect(() => {
    fetchJson<TaxonomyResponse>("/meta/taxonomies")
      .then(setTaxonomy)
      .catch(() => { /* labels just degrade to raw keys */ });
  }, []);

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

  const practiceLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of taxonomy?.practices.categories ?? []) {
      if (cat.key) map.set(cat.key, cat.label);
      map.set(cat.id, cat.label);
    }
    return map;
  }, [taxonomy]);

  const formatLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const fmt of taxonomy?.eventFormats ?? []) {
      map.set(fmt.key, fmt.label);
      map.set(fmt.id, fmt.label);
    }
    return map;
  }, [taxonomy]);

  function labelKey(k: string): string {
    const translated = t(`profile.savedSearches.filterKey.${k}`);
    if (!translated.startsWith("profile.savedSearches.filterKey.")) return translated;
    // Sensible fallbacks for keys we know about but don't have an explicit i18n entry for.
    if (k === "eventDate") return t("eventSearch.eventDate");
    if (k === "eventFormatId") return t("profile.savedSearches.filterKey.format");
    if (k === "practiceCategoryId") return t("profile.savedSearches.filterKey.practice");
    if (k === "practiceSubcategoryId" || k === "practiceSubcategoryIds") return t("profile.savedSearches.filterKey.practice");
    return k;
  }

  function asArray(val: unknown): string[] {
    if (val == null) return [];
    if (Array.isArray(val)) return val.map((v) => String(v)).filter(Boolean);
    return String(val)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function humanizeValuePart(key: string, raw: string): string {
    const v = raw.trim();
    if (!v) return v;

    if (key === "countryCode") {
      try {
        const dn = new Intl.DisplayNames([locale || "en"], { type: "region" });
        return dn.of(v.toUpperCase()) ?? v.toUpperCase();
      } catch {
        return v.toUpperCase();
      }
    }

    if (key === "languages") {
      try {
        const dn = new Intl.DisplayNames([locale || "en"], { type: "language" });
        const labelled = dn.of(v);
        if (labelled && labelled.toLowerCase() !== v.toLowerCase()) return labelled;
      } catch { /* fall through */ }
      return v;
    }

    if (key === "attendanceMode") {
      const i18nKey = `attendanceMode.${v}`;
      const tr = t(i18nKey);
      return tr.startsWith("attendanceMode.") ? v.replace(/_/g, " ") : tr;
    }

    if (key === "eventDate") {
      if (KNOWN_EVENT_DATE_PRESETS.has(v)) {
        const tr = t(`eventSearch.eventDateOption.${v}`);
        return tr.startsWith("eventSearch.eventDateOption.") ? v.replace(/_/g, " ") : tr;
      }
      return v.replace(/_/g, " ");
    }

    if (key === "practice" || key === "practiceCategoryId") {
      return practiceLabelByKey.get(v) ?? v;
    }

    if (key === "format" || key === "eventFormatId") {
      return formatLabelByKey.get(v) ?? v.replace(/_/g, " ");
    }

    return v;
  }

  function formatValue(key: string, val: unknown): string {
    const parts = asArray(val);
    if (parts.length === 0) return "";

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const allUuids = parts.every((p) => uuidRe.test(p));
    // Only collapse to "N selected" if we have UUIDs AND no taxonomy lookup possible
    if (allUuids && key !== "practiceCategoryId" && key !== "eventFormatId") {
      return `${parts.length} ${t("profile.savedSearches.selected")}`;
    }

    const out = parts.map((p) => humanizeValuePart(key, p)).filter(Boolean).join(", ");
    return out.length > 100 ? `${out.slice(0, 100)}…` : out;
  }

  function buildFilterSummary(snap: Record<string, unknown>): { text: string; href: string } {
    const entries = Object.entries(snap).filter(
      ([k, v]) => v != null && String(v).length > 0 && k !== "page" && k !== "view" && k !== "sort",
    );
    const params = new URLSearchParams();
    for (const [k, v] of entries) {
      if (Array.isArray(v)) params.set(k, v.join(","));
      else params.set(k, String(v));
    }
    const href = `/events${params.toString() ? `?${params.toString()}` : ""}`;

    if (entries.length === 0) return { text: t("profile.savedSearches.allEvents"), href };

    const parts: string[] = [];
    const q = snap["q"] ?? snap["query"];
    if (typeof q === "string" && q.length > 0) parts.push(`"${q}"`);
    for (const [k, v] of entries) {
      if (k === "q" || k === "query") continue;
      const valueText = formatValue(k, v);
      if (!valueText) continue;
      parts.push(`${labelKey(k)}: ${valueText}`);
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
                      style={{ width: "auto", fontSize: "0.9rem", padding: "4px 32px 4px 8px" }}
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
                <div className="alerts-item-actions" style={{ display: "flex", gap: 6 }}>
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

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { authorizedGet, authorizedPatch } from "../../../../lib/manageApi";

type ModerationItem = {
  id: string;
  item_type: string;
  item_id: string;
  status: string;
  moderator_name: string | null;
  moderator_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  comment_body: string | null;
  comment_user_name: string | null;
  comment_event_id: string | null;
  comment_event_title: string | null;
  suggestion_category: string | null;
  suggestion_value: string | null;
  suggestion_user_name: string | null;
  suggestion_target_type: string | null;
  suggestion_target_id: string | null;
  suggestion_event_title: string | null;
  report_reason: string | null;
  report_detail: string | null;
  reporter_name: string | null;
  report_target_type: string | null;
  report_target_id: string | null;
  report_target_label: string | null;
  report_count: number | null;
};

type ModerationResponse = {
  items: ModerationItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

type ModerationStats = Record<string, Record<string, number>>;

type ModerationSettings = {
  enabled: boolean;
  bannedWords: string[];
  rateLimit: number;
  aiThreshold: number;
  emailNotifications: boolean;
};

type Tab = "comment" | "edit_suggestion" | "report";

const TABS: Tab[] = ["comment", "edit_suggestion", "report"];

const REPORT_REASONS = [
  { value: "", key: "reasonAll" },
  { value: "spam_or_fake", key: "reasonSpam" },
  { value: "duplicate", key: "reasonDuplicate" },
  { value: "wrong_info", key: "reasonWrongInfo" },
  { value: "no_longer_exists", key: "reasonNoLongerExists" },
  { value: "inappropriate", key: "reasonInappropriate" },
  { value: "other", key: "reasonOther" },
];

export default function AdminModerationPage() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();

  const [tab, setTab] = useState<Tab>("comment");
  const [stats, setStats] = useState<ModerationStats>({});
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [targetType, setTargetType] = useState("");
  const [reason, setReason] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ModerationSettings | null>(null);
  const [settingsSaving, setSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const settingsDialogRef = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("type", tab);
      params.set("page", String(page));
      params.set("pageSize", "20");
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      if (targetType) params.set("targetType", targetType);
      if (reason) params.set("reason", reason);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const [statsData, itemsData] = await Promise.all([
        authorizedGet<ModerationStats>(getToken, "/admin/moderation/stats"),
        authorizedGet<ModerationResponse>(getToken, `/admin/moderation?${params}`),
      ]);
      setStats(statsData);
      setItems(itemsData.items);
      setTotalItems(itemsData.pagination.totalItems);
    } finally {
      setLoading(false);
    }
  }, [getToken, tab, page, statusFilter, search, targetType, reason, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  async function loadSettings() {
    const s = await authorizedGet<ModerationSettings>(getToken, "/admin/settings/moderation");
    setSettings(s);
    setSettingsMsg(null);
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    setSettingsMsg(null);
    try {
      const updated = await authorizedPatch<ModerationSettings>(getToken, "/admin/settings/moderation", settings);
      setSettings(updated);
      setSettingsMsg(t("manage.admin.moderation.settingsSaved"));
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(id: string, status: "approved" | "rejected" | "dismissed") {
    const note = status === "rejected" ? prompt(t("manage.admin.moderation.notePrompt")) : undefined;
    await authorizedPatch(getToken, `/admin/moderation/${id}`, { status, note: note || undefined });
    void load();
  }

  function pendingCount(type: string) {
    return stats[type]?.pending ?? 0;
  }

  function openSettings() {
    void loadSettings();
    setShowSettings(true);
    settingsDialogRef.current?.showModal();
  }

  function closeSettings() {
    setShowSettings(false);
    settingsDialogRef.current?.close();
  }

  const tabLabels: Record<Tab, string> = {
    comment: t("manage.admin.moderation.comments"),
    edit_suggestion: t("manage.admin.moderation.suggestions"),
    report: t("manage.admin.moderation.reports"),
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h1 className="manage-page-title" style={{ margin: 0 }}>{t("manage.admin.moderation.title")}</h1>
        {tab === "comment" && (
          <button type="button" className="secondary-btn" onClick={openSettings}>
            {t("manage.admin.moderation.settings")}
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="manage-status-pills" style={{ marginBottom: 16 }}>
        {TABS.map((tb) => {
          const pending = pendingCount(tb);
          return (
            <button key={tb} type="button" data-active={tab === tb} onClick={() => { setTab(tb); setPage(1); setTargetType(""); setReason(""); }}>
              {tabLabels[tb]}{pending > 0 ? ` (${pending})` : ""}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          className="manage-search-input"
          placeholder={t("manage.admin.moderation.searchPlaceholder")}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <div className="manage-status-pills">
          {[
            { value: "", label: t("manage.admin.moderation.allStatuses") },
            { value: "pending", label: t("manage.admin.moderation.statusPending") },
            { value: "approved", label: t("manage.admin.moderation.statusApproved") },
            { value: "rejected", label: t("manage.admin.moderation.statusRejected") },
            { value: "dismissed", label: t("manage.admin.moderation.statusDismissed") },
          ].map((opt) => (
            <button key={opt.value} type="button" data-active={statusFilter === opt.value} onClick={() => { setStatusFilter(opt.value); setPage(1); }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Second row: target type, reason, date range */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {(tab === "comment" || tab === "report") && (
          <div className="manage-status-pills">
            {[
              { value: "", label: t("manage.admin.moderation.targetAll") },
              { value: "event", label: t("manage.admin.moderation.targetEvent") },
              { value: "organizer", label: t("manage.admin.moderation.targetHost") },
            ].map((opt) => (
              <button key={opt.value} type="button" data-active={targetType === opt.value} onClick={() => { setTargetType(opt.value); setPage(1); }}>
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {tab === "report" && (
          <select
            className="modal-select"
            style={{ minWidth: 140, height: 32, fontSize: "0.8rem" }}
            value={reason}
            onChange={(e) => { setReason(e.target.value); setPage(1); }}
          >
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{t(`manage.admin.moderation.${r.key}`)}</option>
            ))}
          </select>
        )}

        <label className="meta" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {t("manage.admin.moderation.dateFrom")}
          <input type="date" style={{ fontSize: "0.8rem", padding: "2px 4px" }} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
        </label>
        <label className="meta" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {t("manage.admin.moderation.dateTo")}
          <input type="date" style={{ fontSize: "0.8rem", padding: "2px 4px" }} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
        </label>

        <span className="meta" style={{ marginLeft: "auto" }}>
          {t("manage.pagination.showing", { start: (page - 1) * 20 + 1, end: (page - 1) * 20 + items.length, total: totalItems })}
        </span>
      </div>

      {loading ? (
        <div className="manage-loading">{t("manage.common.loading")}</div>
      ) : items.length === 0 ? (
        <div className="manage-empty"><h3>{t("manage.admin.moderation.noItems")}</h3></div>
      ) : (
        <>
          <div className="manage-table-wrap">
            <table className="manage-table">
              <thead>
                <tr>
                  <th>{t("manage.admin.moderation.date")}</th>
                  <th>{t("manage.admin.moderation.user")}</th>
                  <th>{t("manage.admin.moderation.target")}</th>
                  <th>{t("manage.admin.moderation.content")}</th>
                  {tab === "report" && <th style={{ textAlign: "center" }}>#</th>}
                  <th>{t("manage.common.status")}</th>
                  <th className="text-right">{t("manage.admin.users.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const escalated = item.item_type === "report" && (item.report_count ?? 0) >= 3;
                  return (
                    <tr key={item.id} style={escalated ? { backgroundColor: "rgba(217, 119, 6, 0.1)" } : undefined}>
                      <td style={{ whiteSpace: "nowrap" }}>{new Date(item.created_at).toLocaleDateString()}</td>
                      <td>{item.item_type === "comment" ? item.comment_user_name : item.item_type === "edit_suggestion" ? item.suggestion_user_name : item.reporter_name}</td>
                      <td>
                        {item.item_type === "comment" && item.comment_event_id ? (
                          <Link href={`/manage/events/${item.comment_event_id}`} target="_blank" style={{ textDecoration: "none" }}>
                            {item.comment_event_title}
                          </Link>
                        ) : item.item_type === "edit_suggestion" && item.suggestion_target_id ? (
                          <Link href={`/manage/${item.suggestion_target_type === "organizer" ? "hosts" : "events"}/${item.suggestion_target_id}`} target="_blank" style={{ textDecoration: "none" }}>
                            {item.suggestion_event_title}
                          </Link>
                        ) : item.item_type === "report" && item.report_target_id ? (
                          <Link href={`/manage/${item.report_target_type === "organizer" ? "hosts" : "events"}/${item.report_target_id}`} target="_blank" style={{ textDecoration: "none" }}>
                            {item.report_target_label ?? item.item_id}
                          </Link>
                        ) : (
                          item.comment_event_title ?? item.suggestion_event_title ?? item.report_target_label ?? item.item_id
                        )}
                      </td>
                      <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.item_type === "comment" ? item.comment_body
                          : item.item_type === "edit_suggestion" ? `[${item.suggestion_category}] ${item.suggestion_value ?? ""}`
                          : `${item.report_reason}: ${item.report_detail ?? ""}`}
                      </td>
                      {tab === "report" && (
                        <td style={{ textAlign: "center", fontWeight: escalated ? 700 : 400, color: escalated ? "var(--warning, #d97706)" : undefined }}>
                          {item.report_count ?? "\u2014"}
                        </td>
                      )}
                      <td>
                        <span className={`tag tag--${item.status}`} style={{ fontSize: "0.7rem" }}>{item.status}</span>
                      </td>
                      <td className="text-right">
                        {item.status === "pending" && (
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                            {tab === "comment" && (<>
                              <button type="button" className="secondary-btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => void handleAction(item.id, "approved")}>
                                {t("manage.admin.moderation.approve")}
                              </button>
                              <button type="button" className="secondary-btn" style={{ fontSize: "0.75rem", padding: "2px 8px", color: "var(--danger, #c53030)" }} onClick={() => void handleAction(item.id, "rejected")}>
                                {t("manage.admin.moderation.remove")}
                              </button>
                            </>)}
                            {tab === "edit_suggestion" && (<>
                              <button type="button" className="secondary-btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => void handleAction(item.id, "approved")}>
                                {t("manage.admin.moderation.approve")}
                              </button>
                              <button type="button" className="secondary-btn" style={{ fontSize: "0.75rem", padding: "2px 8px", color: "var(--danger, #c53030)" }} onClick={() => void handleAction(item.id, "rejected")}>
                                {t("manage.admin.moderation.reject")}
                              </button>
                            </>)}
                            {tab === "report" && (<>
                              <button type="button" className="secondary-btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => void handleAction(item.id, "approved")}>
                                {t("manage.admin.moderation.resolve")}
                              </button>
                              <button type="button" className="secondary-btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => void handleAction(item.id, "dismissed")}>
                                {t("manage.admin.moderation.dismiss")}
                              </button>
                            </>)}
                          </div>
                        )}
                        {item.moderator_name && (
                          <div className="meta" style={{ fontSize: "0.7rem", marginTop: 2 }}>
                            {item.moderator_name}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="manage-pagination" style={{ marginTop: 12 }}>
            {page > 1 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>{t("manage.common.previous")}</button>}
            {items.length === 20 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>{t("manage.common.next")}</button>}
          </div>
        </>
      )}

      {/* Settings dialog */}
      <dialog ref={settingsDialogRef} className="manage-dialog" style={{ maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>{t("manage.admin.moderation.settingsTitle")}</h3>
        {settings && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="modal-field">
              <label className="modal-label">{t("manage.admin.moderation.aiThreshold")}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.aiThreshold ?? 0.85}
                  onChange={(e) => setSettings({ ...settings, aiThreshold: parseFloat(e.target.value) })}
                  style={{ flex: 1 }}
                />
                <span style={{ fontWeight: 600, minWidth: 36, textAlign: "right" }}>{(settings.aiThreshold ?? 0.85).toFixed(2)}</span>
              </div>
              <div className="meta" style={{ fontSize: "0.75rem" }}>{t("manage.admin.moderation.aiThresholdHelp")}</div>
            </div>

            <div className="modal-field">
              <label className="modal-label">{t("manage.admin.moderation.bannedWords")}</label>
              <textarea
                rows={3}
                value={(settings.bannedWords ?? []).join(", ")}
                onChange={(e) => setSettings({ ...settings, bannedWords: e.target.value.split(",").map((w) => w.trim()).filter(Boolean) })}
                style={{ width: "100%" }}
              />
              <div className="meta" style={{ fontSize: "0.75rem" }}>{t("manage.admin.moderation.bannedWordsHelp")}</div>
            </div>

            <div className="modal-field">
              <label className="modal-label">{t("manage.admin.moderation.rateLimit")}</label>
              <input
                type="number"
                min="1"
                max="100"
                value={settings.rateLimit ?? 5}
                onChange={(e) => setSettings({ ...settings, rateLimit: parseInt(e.target.value, 10) || 5 })}
                style={{ width: 80 }}
              />
              <div className="meta" style={{ fontSize: "0.75rem" }}>{t("manage.admin.moderation.rateLimitHelp")}</div>
            </div>

            <label className="toggle-control">
              <input
                className="toggle-control-input"
                type="checkbox"
                checked={settings.enabled !== false}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
              />
              <span className="toggle-control-track" aria-hidden />
              <span>{t("manage.admin.moderation.commentsEnabled")}</span>
            </label>
            <div className="meta" style={{ fontSize: "0.75rem", marginTop: -12 }}>{t("manage.admin.moderation.commentsEnabledHelp")}</div>

            <label className="toggle-control">
              <input
                className="toggle-control-input"
                type="checkbox"
                checked={settings.emailNotifications === true}
                onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })}
              />
              <span className="toggle-control-track" aria-hidden />
              <span>{t("manage.admin.moderation.emailNotifications")}</span>
            </label>
            <div className="meta" style={{ fontSize: "0.75rem", marginTop: -12 }}>{t("manage.admin.moderation.emailNotificationsHelp")}</div>

            {settingsMsg && <div className="meta" style={{ color: "var(--success, #16a34a)" }}>{settingsMsg}</div>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="secondary-btn" onClick={closeSettings}>
                {t("manage.admin.moderation.settingsClose")}
              </button>
              <button type="button" className="primary-btn" onClick={() => void saveSettings()} disabled={settingsSaving}>
                {settingsSaving ? t("profile.saving") : t("manage.admin.moderation.settingsSave")}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}

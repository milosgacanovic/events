"use client";

import { useCallback, useEffect, useState } from "react";

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
  // comment
  comment_body: string | null;
  comment_user_name: string | null;
  comment_event_title: string | null;
  // suggestion
  suggestion_category: string | null;
  suggestion_value: string | null;
  suggestion_user_name: string | null;
  suggestion_event_title: string | null;
  // report
  report_reason: string | null;
  report_detail: string | null;
  reporter_name: string | null;
  report_target_type: string | null;
  report_target_label: string | null;
};

type ModerationResponse = {
  items: ModerationItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

type ModerationStats = Record<string, Record<string, number>>;

type Tab = "comment" | "edit_suggestion" | "report";

const TABS: Tab[] = ["comment", "edit_suggestion", "report"];

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("type", tab);
      params.set("page", String(page));
      params.set("pageSize", "20");
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);

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
  }, [getToken, tab, page, statusFilter, search]);

  useEffect(() => { void load(); }, [load]);

  async function handleAction(id: string, status: "approved" | "rejected" | "dismissed") {
    const note = status === "rejected" ? prompt(t("manage.admin.moderation.notePrompt")) : undefined;
    await authorizedPatch(getToken, `/admin/moderation/${id}`, { status, note: note || undefined });
    void load();
  }

  function pendingCount(type: string) {
    return stats[type]?.pending ?? 0;
  }

  const tabLabels: Record<Tab, string> = {
    comment: t("manage.admin.moderation.comments"),
    edit_suggestion: t("manage.admin.moderation.suggestions"),
    report: t("manage.admin.moderation.reports"),
  };

  return (
    <div>
      <h1 className="manage-page-title">{t("manage.admin.moderation.title")}</h1>

      {/* Sub-tabs */}
      <div className="manage-status-pills" style={{ marginBottom: 16 }}>
        {TABS.map((tb) => {
          const pending = pendingCount(tb);
          return (
            <button key={tb} type="button" data-active={tab === tb} onClick={() => { setTab(tb); setPage(1); }}>
              {tabLabels[tb]}{pending > 0 ? ` (${pending})` : ""}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
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
        <span className="meta" style={{ marginLeft: "auto", alignSelf: "center" }}>
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
                  <th>{t("manage.common.status")}</th>
                  <th className="text-right">{t("manage.admin.users.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(item.created_at).toLocaleDateString()}</td>
                    <td>{item.item_type === "comment" ? item.comment_user_name : item.item_type === "edit_suggestion" ? item.suggestion_user_name : item.reporter_name}</td>
                    <td>
                      {item.item_type === "comment" ? item.comment_event_title
                        : item.item_type === "edit_suggestion" ? item.suggestion_event_title
                        : `${item.report_target_type}: ${item.report_target_label ?? item.item_id}`}
                    </td>
                    <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.item_type === "comment" ? item.comment_body
                        : item.item_type === "edit_suggestion" ? `[${item.suggestion_category}] ${item.suggestion_value ?? ""}`
                        : `${item.report_reason}: ${item.report_detail ?? ""}`}
                    </td>
                    <td>
                      <span className={`tag tag--${item.status}`} style={{ fontSize: "0.7rem" }}>{item.status}</span>
                    </td>
                    <td className="text-right">
                      {item.status === "pending" && (
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button type="button" className="secondary-btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => void handleAction(item.id, "approved")}>
                            {t("manage.admin.moderation.approve")}
                          </button>
                          <button type="button" className="secondary-btn" style={{ fontSize: "0.75rem", padding: "2px 8px", color: "var(--danger, #c53030)" }} onClick={() => void handleAction(item.id, "rejected")}>
                            {t("manage.admin.moderation.reject")}
                          </button>
                          <button type="button" className="secondary-btn" style={{ fontSize: "0.75rem", padding: "2px 8px" }} onClick={() => void handleAction(item.id, "dismissed")}>
                            {t("manage.admin.moderation.dismiss")}
                          </button>
                        </div>
                      )}
                      {item.moderator_name && (
                        <div className="meta" style={{ fontSize: "0.7rem", marginTop: 2 }}>
                          {item.moderator_name}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="manage-pagination" style={{ marginTop: 12 }}>
            {page > 1 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>{t("manage.common.previous")}</button>}
            {items.length === 20 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>{t("manage.common.next")}</button>}
          </div>
        </>
      )}
    </div>
  );
}

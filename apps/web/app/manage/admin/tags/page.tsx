"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { ConfirmDialog } from "../../../../components/manage/ConfirmDialog";
import { authorizedGet, authorizedPatch } from "../../../../lib/manageApi";

type TagSuggestionItem = {
  id: string;
  tag: string;
  reason: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  suggested_by_name: string | null;
};

type TagSuggestionsResponse = {
  items: TagSuggestionItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  dismissed: "Dismissed",
};

export default function AdminTagSuggestionsPage() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<TagSuggestionItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [alertMsg, setAlertMsg] = useState("");
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (statusFilter) params.set("status", statusFilter);
      const data = await authorizedGet<TagSuggestionsResponse>(getToken, `/admin/tag-suggestions?${params}`);
      setItems(data.items);
      setTotalItems(data.pagination.totalItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [getToken, page, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  async function handleAction(id: string, status: "approved" | "dismissed") {
    setActionLoading(id);
    try {
      await authorizedPatch(getToken, `/admin/tag-suggestions/${id}`, { status });
      void load();
    } catch {
      setAlertMsg("Action failed. Please try again.");
    } finally {
      setActionLoading(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
  }

  const pageStart = (page - 1) * pageSize + 1;
  const pageEnd = (page - 1) * pageSize + items.length;

  return (
    <div>
      <h1 className="manage-page-title">{t("manage.admin.tags.title")}</h1>

      <div className="manage-filter-bar">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="pending">{t("manage.admin.tags.filterPending")}</option>
          <option value="approved">{t("manage.admin.tags.filterApproved")}</option>
          <option value="dismissed">{t("manage.admin.tags.filterDismissed")}</option>
          <option value="">{t("manage.admin.hosts.allStatuses")}</option>
        </select>
        {totalItems > 0 && (
          <span className="meta">{t("manage.pagination.showing", { start: pageStart, end: pageEnd, total: totalItems })}</span>
        )}
      </div>

      {error && (
        <div className="manage-empty">
          <p>{error}</p>
          <button type="button" className="secondary-btn" onClick={() => void load()} style={{ marginTop: 8 }}>{t("manage.error.retry")}</button>
        </div>
      )}

      {!error && loading && items.length === 0 && (
        <div className="manage-loading">{t("manage.common.loading")}</div>
      )}

      {!error && !loading && items.length === 0 && (
        <div className="manage-empty">
          <p>{t("manage.admin.tags.empty")}</p>
        </div>
      )}

      {!error && items.length > 0 && (
        <>
          <div className={`manage-card-list${loading ? " manage-list-loading" : ""}`}>
            {items.map((item) => (
              <div key={item.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "1.05rem", marginBottom: 4 }}>{item.tag}</div>
                    {item.reason && <div className="meta" style={{ marginBottom: 6 }}>{item.reason}</div>}
                    <div className="meta" style={{ fontSize: "0.8rem" }}>
                      {item.suggested_by_name ? `${t("manage.admin.tags.suggestedBy", { name: item.suggested_by_name })}` : "Anonymous"} &middot; {formatDate(item.created_at)}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span className={`tag manage-status-pill manage-status-pill--${item.status === "approved" ? "published" : item.status === "dismissed" ? "archived" : "draft"}`}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </span>
                    {item.status === "pending" && (
                      <>
                        <button type="button" className="manage-card-action-btn manage-btn-publish"
                          disabled={actionLoading === item.id}
                          onClick={() => handleAction(item.id, "approved")}>
                          {t("manage.admin.tags.approve")}
                        </button>
                        <button type="button" className="manage-card-action-btn manage-btn-cancel"
                          disabled={actionLoading === item.id}
                          onClick={() => handleAction(item.id, "dismissed")}>
                          {t("manage.admin.tags.dismiss")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {(page > 1 || items.length === pageSize) && (
            <div className="manage-pagination">
              {page > 1 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>{t("manage.common.previous")}</button>}
              {items.length === pageSize && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>{t("manage.common.next")}</button>}
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={!!alertMsg}
        title={t("manage.confirm.title")}
        message={alertMsg}
        confirmLabel={t("common.action.ok")}
        onConfirm={() => setAlertMsg("")}
        onCancel={() => setAlertMsg("")}
      />
    </div>
  );
}

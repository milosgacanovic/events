"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { authorizedGet } from "../../../../lib/manageApi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivityLogItem = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  targetSlug: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type ActivityLogDetail = ActivityLogItem & {
  snapshot: Record<string, unknown> | null;
};

type ErrorLogItem = {
  id: string;
  errorMessage: string;
  requestMethod: string | null;
  requestUrl: string | null;
  statusCode: number | null;
  actorName: string | null;
  createdAt: string;
};

type ErrorLogDetail = ErrorLogItem & {
  stackTrace: string | null;
  requestBody: Record<string, unknown> | null;
  actorId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

type Pagination = { page: number; pageSize: number; totalPages: number; totalItems: number };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "event.create", label: "Event created" },
  { value: "event.edit", label: "Event edited" },
  { value: "event.publish", label: "Event published" },
  { value: "event.unpublish", label: "Event unpublished" },
  { value: "event.cancel", label: "Event cancelled" },
  { value: "event.archive", label: "Event archived" },
  { value: "event.delete", label: "Event deleted" },
  { value: "event.reattach", label: "Event reattached" },
  { value: "host.create", label: "Host created" },
  { value: "host.edit", label: "Host edited" },
  { value: "host.delete", label: "Host deleted" },
  { value: "user.role_change", label: "User role changed" },
  { value: "user.service_account_change", label: "Service account toggle" },
  { value: "ownership.replace", label: "Ownership replaced" },
];

const TARGET_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "event", label: "Event" },
  { value: "host", label: "Host" },
  { value: "user", label: "User" },
];

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminLogsPage() {
  const { getToken } = useKeycloakAuth();
  const [tab, setTab] = useState<"activity" | "errors">("activity");

  // --- Activity state ---
  const [activityItems, setActivityItems] = useState<ActivityLogItem[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activitySearch, setActivitySearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [activityDateFrom, setActivityDateFrom] = useState("");
  const [activityDateTo, setActivityDateTo] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [excludeServiceAccounts, setExcludeServiceAccounts] = useState(false);
  const [actors, setActors] = useState<Array<{ id: string; name: string }>>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState("");

  // --- Error state ---
  const [errorItems, setErrorItems] = useState<ErrorLogItem[]>([]);
  const [errorTotal, setErrorTotal] = useState(0);
  const [errorPage, setErrorPage] = useState(1);
  const [errorSearch, setErrorSearch] = useState("");
  const [errorDateFrom, setErrorDateFrom] = useState("");
  const [errorDateTo, setErrorDateTo] = useState("");
  const [errorLoading, setErrorLoading] = useState(false);
  const [errorError, setErrorError] = useState("");

  // --- Detail dialog ---
  const detailDialogRef = useRef<HTMLDialogElement>(null);
  const [detailContent, setDetailContent] = useState<ActivityLogDetail | ErrorLogDetail | null>(null);
  const [detailType, setDetailType] = useState<"activity" | "error">("activity");
  const [detailLoading, setDetailLoading] = useState(false);

  // --- Load actors for filter ---
  useEffect(() => {
    void (async () => {
      try {
        const data = await authorizedGet<Array<{ id: string; name: string }>>(getToken, "/admin/activity-logs/actors");
        setActors(data);
      } catch { /* ignore */ }
    })();
  }, [getToken]);

  // --- Load activity logs ---
  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError("");
    try {
      const params = new URLSearchParams({ page: String(activityPage), pageSize: String(PAGE_SIZE) });
      if (activitySearch) params.set("q", activitySearch);
      if (actionFilter) params.set("action", actionFilter);
      if (targetTypeFilter) params.set("targetType", targetTypeFilter);
      if (actorFilter) params.set("actorId", actorFilter);
      if (excludeServiceAccounts) params.set("excludeServiceAccounts", "true");
      if (activityDateFrom) params.set("dateFrom", activityDateFrom);
      if (activityDateTo) params.set("dateTo", activityDateTo);
      const data = await authorizedGet<{ items: ActivityLogItem[]; pagination: Pagination }>(
        getToken, `/admin/activity-logs?${params}`,
      );
      setActivityItems(data.items);
      setActivityTotal(data.pagination.totalItems);
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : "Failed to load activity logs");
    } finally {
      setActivityLoading(false);
    }
  }, [getToken, activityPage, activitySearch, actionFilter, targetTypeFilter, actorFilter, excludeServiceAccounts, activityDateFrom, activityDateTo]);

  // --- Load error logs ---
  const loadErrors = useCallback(async () => {
    setErrorLoading(true);
    setErrorError("");
    try {
      const params = new URLSearchParams({ page: String(errorPage), pageSize: String(PAGE_SIZE) });
      if (errorSearch) params.set("q", errorSearch);
      if (errorDateFrom) params.set("dateFrom", errorDateFrom);
      if (errorDateTo) params.set("dateTo", errorDateTo);
      const data = await authorizedGet<{ items: ErrorLogItem[]; pagination: Pagination }>(
        getToken, `/admin/error-logs?${params}`,
      );
      setErrorItems(data.items);
      setErrorTotal(data.pagination.totalItems);
    } catch (err) {
      setErrorError(err instanceof Error ? err.message : "Failed to load error logs");
    } finally {
      setErrorLoading(false);
    }
  }, [getToken, errorPage, errorSearch, errorDateFrom, errorDateTo]);

  useEffect(() => { if (tab === "activity") void loadActivity(); }, [tab, loadActivity]);
  useEffect(() => { if (tab === "errors") void loadErrors(); }, [tab, loadErrors]);

  // --- Open detail ---
  async function openDetail(type: "activity" | "error", id: string) {
    setDetailType(type);
    setDetailContent(null);
    setDetailLoading(true);
    detailDialogRef.current?.showModal();
    try {
      const endpoint = type === "activity" ? `/admin/activity-logs/${id}` : `/admin/error-logs/${id}`;
      const data = await authorizedGet<ActivityLogDetail | ErrorLogDetail>(getToken, endpoint);
      setDetailContent(data);
    } catch {
      setDetailContent(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function targetUrl(item: ActivityLogItem): string | null {
    if (!item.targetSlug) return null;
    if (item.targetType === "event") return `/events/${item.targetSlug}`;
    if (item.targetType === "host") return `/hosts/${item.targetSlug}`;
    return null;
  }

  function actionBadgeClass(action: string) {
    if (action.includes("delete")) return "manage-badge manage-badge--red";
    if (action.includes("create")) return "manage-badge manage-badge--green";
    if (action.includes("publish") && !action.includes("unpublish")) return "manage-badge manage-badge--blue";
    return "manage-badge";
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="manage-page">
      <h1>Activity Logs</h1>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={tab === "activity" ? "primary-btn" : "ghost-btn"}
          onClick={() => setTab("activity")}
        >
          Activity Log ({activityTotal})
        </button>
        <button
          className={tab === "errors" ? "primary-btn" : "ghost-btn"}
          onClick={() => setTab("errors")}
        >
          Error Log ({errorTotal})
        </button>
      </div>

      {/* Activity tab */}
      {tab === "activity" && (
        <>
          <div className="manage-filter-bar">
            <div className="manage-filter-row">
              <input
                type="search"
                placeholder="Search logs..."
                value={activitySearch}
                onChange={(e) => { setActivitySearch(e.target.value); setActivityPage(1); }}
                style={{ flex: 1, minWidth: 120 }}
              />
              <select
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setActivityPage(1); }}
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={targetTypeFilter}
                onChange={(e) => { setTargetTypeFilter(e.target.value); setActivityPage(1); }}
              >
                {TARGET_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <select
                value={actorFilter}
                onChange={(e) => { setActorFilter(e.target.value); setActivityPage(1); }}
              >
                <option value="">All actors</option>
                {actors.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="filter-pill"
                data-active={excludeServiceAccounts}
                onClick={() => { setExcludeServiceAccounts((v) => !v); setActivityPage(1); }}
              >
                Exclude service accounts
              </button>
              <input
                type="date"
                value={activityDateFrom}
                onChange={(e) => { setActivityDateFrom(e.target.value); setActivityPage(1); }}
                title="From date"
              />
              <input
                type="date"
                value={activityDateTo}
                onChange={(e) => { setActivityDateTo(e.target.value); setActivityPage(1); }}
                title="To date"
              />
              <span className="meta">{activityTotal} entries</span>
            </div>
          </div>

          {activityError && (
            <div className="manage-empty" style={{ color: "var(--danger)" }}>
              {activityError}
              <button className="ghost-btn" onClick={loadActivity} style={{ marginLeft: 8 }}>Retry</button>
            </div>
          )}

          {activityLoading && <div className="manage-loading">Loading...</div>}

          {!activityLoading && !activityError && activityItems.length === 0 && (
            <div className="manage-empty">No activity logs found.</div>
          )}

          {!activityLoading && activityItems.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="manage-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Target</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activityItems.map((item) => (
                    <tr key={item.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: "0.85em" }}>{formatDate(item.createdAt)}</td>
                      <td><span className={actionBadgeClass(item.action)}>{item.action}</span></td>
                      <td>{item.actorName ?? <span className="manage-meta">system</span>}</td>
                      <td>
                        {item.targetLabel ? (
                          targetUrl(item) ? (
                            <a href={targetUrl(item)!} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                              {item.targetLabel}
                            </a>
                          ) : (
                            <span>{item.targetLabel}</span>
                          )
                        ) : item.targetId ? (
                          <span className="manage-meta" style={{ fontSize: "0.8em" }}>{item.targetId.slice(0, 8)}...</span>
                        ) : null}
                        {item.targetType && (
                          <span className="manage-meta" style={{ fontSize: "0.75em", marginLeft: 6 }}>{item.targetType}</span>
                        )}
                      </td>
                      <td>
                        <button className="ghost-btn" onClick={() => openDetail("activity", item.id)} title="View details">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button className="ghost-btn" disabled={activityPage <= 1} onClick={() => setActivityPage((p) => p - 1)}>
              Previous
            </button>
            <span className="manage-meta">Page {activityPage}</span>
            <button className="ghost-btn" disabled={activityItems.length < PAGE_SIZE} onClick={() => setActivityPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </>
      )}

      {/* Error tab */}
      {tab === "errors" && (
        <>
          <div className="manage-filter-bar">
            <div className="manage-filter-row">
              <input
                type="search"
                placeholder="Search errors..."
                value={errorSearch}
                onChange={(e) => { setErrorSearch(e.target.value); setErrorPage(1); }}
                style={{ flex: 1, minWidth: 120 }}
              />
              <input
                type="date"
                value={errorDateFrom}
                onChange={(e) => { setErrorDateFrom(e.target.value); setErrorPage(1); }}
                title="From date"
              />
              <input
                type="date"
                value={errorDateTo}
                onChange={(e) => { setErrorDateTo(e.target.value); setErrorPage(1); }}
                title="To date"
              />
              <span className="meta">{errorTotal} entries</span>
            </div>
          </div>

          {errorError && (
            <div className="manage-empty" style={{ color: "var(--danger)" }}>
              {errorError}
              <button className="ghost-btn" onClick={loadErrors} style={{ marginLeft: 8 }}>Retry</button>
            </div>
          )}

          {errorLoading && <div className="manage-loading">Loading...</div>}

          {!errorLoading && !errorError && errorItems.length === 0 && (
            <div className="manage-empty">No error logs found.</div>
          )}

          {!errorLoading && errorItems.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="manage-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Method &amp; URL</th>
                    <th>Error</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {errorItems.map((item) => (
                    <tr key={item.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: "0.85em" }}>{formatDate(item.createdAt)}</td>
                      <td><span className="manage-badge manage-badge--red">{item.statusCode ?? "?"}</span></td>
                      <td style={{ fontSize: "0.85em", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.requestMethod} {item.requestUrl}
                      </td>
                      <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.errorMessage}
                      </td>
                      <td>
                        <button className="ghost-btn" onClick={() => openDetail("error", item.id)} title="View details">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button className="ghost-btn" disabled={errorPage <= 1} onClick={() => setErrorPage((p) => p - 1)}>
              Previous
            </button>
            <span className="manage-meta">Page {errorPage}</span>
            <button className="ghost-btn" disabled={errorItems.length < PAGE_SIZE} onClick={() => setErrorPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </>
      )}

      {/* Detail dialog */}
      <dialog ref={detailDialogRef} className="manage-dialog manage-dialog--wide">
        <div className="manage-dialog-header">
          <h2>{detailType === "activity" ? "Activity Log Detail" : "Error Log Detail"}</h2>
          <button className="ghost-btn" onClick={() => detailDialogRef.current?.close()}>Close</button>
        </div>
        <div className="manage-dialog-body" style={{ maxHeight: "70vh", overflow: "auto" }}>
          {detailLoading && <div className="manage-loading">Loading...</div>}
          {!detailLoading && detailContent && detailType === "activity" && (() => {
            const d = detailContent as ActivityLogDetail;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <strong>Date:</strong> {formatDate(d.createdAt)}
                </div>
                <div>
                  <strong>Action:</strong> <span className={actionBadgeClass(d.action)}>{d.action}</span>
                </div>
                <div>
                  <strong>Actor:</strong> {d.actorName ?? "system"}
                  {d.actorId && <span className="manage-meta" style={{ marginLeft: 8 }}>({d.actorId.slice(0, 8)}...)</span>}
                </div>
                <div>
                  <strong>Target:</strong> {d.targetType} {d.targetLabel ? `— ${d.targetLabel}` : ""}
                  {d.targetId && <span className="manage-meta" style={{ marginLeft: 8 }}>({d.targetId})</span>}
                </div>
                {d.ipAddress && <div><strong>IP:</strong> {d.ipAddress}</div>}
                {d.userAgent && <div><strong>User Agent:</strong> <span style={{ fontSize: "0.85em", wordBreak: "break-all" }}>{d.userAgent}</span></div>}
                {d.metadata && Object.keys(d.metadata).length > 0 && (
                  <div>
                    <strong>Metadata:</strong>
                    <pre style={{ background: "var(--bg-secondary, #f5f5f5)", padding: 12, borderRadius: 6, overflow: "auto", maxHeight: 300, fontSize: "0.85em" }}>
                      {JSON.stringify(d.metadata, null, 2)}
                    </pre>
                  </div>
                )}
                {d.snapshot && (
                  <div>
                    <strong>Snapshot:</strong>
                    <pre style={{ background: "var(--bg-secondary, #f5f5f5)", padding: 12, borderRadius: 6, overflow: "auto", maxHeight: 400, fontSize: "0.85em" }}>
                      {JSON.stringify(d.snapshot, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })()}
          {!detailLoading && detailContent && detailType === "error" && (() => {
            const d = detailContent as ErrorLogDetail;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <strong>Date:</strong> {formatDate(d.createdAt)}
                </div>
                <div>
                  <strong>Status:</strong> <span className="manage-badge manage-badge--red">{d.statusCode ?? "?"}</span>
                </div>
                <div>
                  <strong>Request:</strong> {d.requestMethod} {d.requestUrl}
                </div>
                <div>
                  <strong>Error:</strong> {d.errorMessage}
                </div>
                {d.actorName && <div><strong>Actor:</strong> {d.actorName}</div>}
                {d.ipAddress && <div><strong>IP:</strong> {d.ipAddress}</div>}
                {d.userAgent && <div><strong>User Agent:</strong> <span style={{ fontSize: "0.85em", wordBreak: "break-all" }}>{d.userAgent}</span></div>}
                {d.stackTrace && (
                  <div>
                    <strong>Stack Trace:</strong>
                    <pre style={{ background: "var(--bg-secondary, #f5f5f5)", padding: 12, borderRadius: 6, overflow: "auto", maxHeight: 400, fontSize: "0.8em", whiteSpace: "pre-wrap" }}>
                      {d.stackTrace}
                    </pre>
                  </div>
                )}
                {d.requestBody && Object.keys(d.requestBody).length > 0 && (
                  <div>
                    <strong>Request Body:</strong>
                    <pre style={{ background: "var(--bg-secondary, #f5f5f5)", padding: 12, borderRadius: 6, overflow: "auto", maxHeight: 300, fontSize: "0.85em" }}>
                      {JSON.stringify(d.requestBody, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </dialog>
    </div>
  );
}

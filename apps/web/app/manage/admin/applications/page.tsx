"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { authorizedGet, authorizedPatch } from "../../../../lib/manageApi";

type ApplicationItem = {
  id: string;
  name: string;
  email: string;
  intent: string;
  intent_other: string | null;
  description: string | null;
  proof_url: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

type ApplicationsResponse = {
  items: ApplicationItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

type DialogState = {
  type: "approve" | "reject" | "request_info";
  appId: string;
  appName: string;
  message: string;
} | null;

const DEFAULT_APPROVE_MESSAGE = `Congratulations! Your application to become an editor on DanceResource has been approved.

You now have access to create and manage events. Here's how to get started:

1. Go to the Manage area (events.danceresource.org/manage)
2. Create your first event or host
3. Link your events to your host/organization

Welcome aboard!`;

const DEFAULT_REJECT_MESSAGE = `Thank you for your interest in DanceResource. After reviewing your application, we're unable to approve editor access at this time.

If you believe this was in error or your circumstances have changed, please feel free to apply again or contact us at hello@danceresource.org.`;

export default function AdminApplicationsPage() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const [apps, setApps] = useState<ApplicationItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (statusFilter) params.set("status", statusFilter);
      const data = await authorizedGet<ApplicationsResponse>(getToken, `/admin/applications?${params}`);
      setApps(data.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [getToken, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  function openDialog(type: "approve" | "reject" | "request_info", app: ApplicationItem) {
    const defaults: Record<string, string> = {
      approve: DEFAULT_APPROVE_MESSAGE,
      reject: DEFAULT_REJECT_MESSAGE,
      request_info: "",
    };
    setDialog({ type, appId: app.id, appName: app.name, message: defaults[type] });
  }

  async function submitDialog() {
    if (!dialog) return;
    setSubmitting(true);
    try {
      const statusMap: Record<string, string> = {
        approve: "approved",
        reject: "rejected",
        request_info: "more_info_requested",
      };
      const status = statusMap[dialog.type];
      const body: Record<string, string> = { status };
      if (dialog.type === "reject") {
        body.rejectionReason = dialog.message;
      } else {
        body.adminNotes = dialog.message;
      }
      await authorizedPatch(getToken, `/admin/applications/${dialog.appId}`, body);
      setActionStatus(`Application ${status}`);
      setDialog(null);
      void load();
    } catch (err) {
      setActionStatus(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    } finally {
      setSubmitting(false);
    }
  }

  const dialogTitles: Record<string, string> = {
    approve: "Approve Application",
    reject: "Reject Application",
    request_info: "Request More Information",
  };

  const dialogActions: Record<string, string> = {
    approve: "Approve & Send Email",
    reject: "Reject & Send Email",
    request_info: "Send & Request Info",
  };

  const dialogBtnClass: Record<string, string> = {
    approve: "primary-btn",
    reject: "primary-btn",
    request_info: "secondary-btn",
  };

  return (
    <div>
      <h1 className="manage-page-title">{t("manage.admin.applications.title")}</h1>

      <div className="manage-filter-bar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="pending">{t("manage.admin.applications.filterPending")}</option>
          <option value="approved">{t("manage.admin.applications.filterApproved")}</option>
          <option value="rejected">{t("manage.admin.applications.filterRejected")}</option>
          <option value="">{t("manage.admin.applications.filterAll")}</option>
        </select>
      </div>

      {loading ? (
        <div className="manage-loading">{t("manage.common.loading")}</div>
      ) : apps.length === 0 ? (
        <div className="manage-empty">
          <h3>{t("manage.admin.applications.noApplications")}</h3>
          <p>{t("manage.admin.applications.noApplicationsFiltered", { status: statusFilter || "" })}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {apps.map((app) => (
            <div key={app.id} className="manage-event-card">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{app.name}</strong>
                <span className="tag">{app.status}</span>
              </div>
              <div className="meta">{app.email}</div>
              <div className="meta">
                {t("manage.admin.applications.intentPrefix", { intent: app.intent })}{app.intent_other ? ` — ${app.intent_other}` : ""}
              </div>
              {app.description && <div className="meta" style={{ marginTop: 4 }}>{app.description}</div>}
              {app.proof_url && (
                <div className="meta">
                  Link: <a href={app.proof_url} target="_blank" rel="noopener noreferrer">{app.proof_url}</a>
                </div>
              )}
              <div className="meta">{t("manage.admin.applications.appliedDate", { date: new Date(app.created_at).toLocaleDateString() })}</div>
              {app.status === "pending" && (
                <div className="manage-event-card-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="primary-btn" style={{ fontSize: "0.85rem" }} onClick={() => openDialog("approve", app)}>
                    {t("manage.admin.applications.approve")}
                  </button>
                  <button type="button" className="ghost-btn" style={{ fontSize: "0.85rem" }} onClick={() => openDialog("reject", app)}>
                    {t("manage.admin.applications.reject")}
                  </button>
                  <button type="button" className="secondary-btn" style={{ fontSize: "0.85rem" }} onClick={() => openDialog("request_info", app)}>
                    {t("manage.admin.applications.requestInfo")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {actionStatus && <div className="meta" style={{ padding: "8px 0" }}>{actionStatus}</div>}

      {/* Action Dialog */}
      {dialog && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {/* Overlay */}
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
            onClick={() => setDialog(null)}
          />
          {/* Card */}
          <div
            className="manage-event-card"
            style={{
              position: "relative", zIndex: 1, width: "100%", maxWidth: 520,
              margin: 16, padding: 24,
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: "1.15rem" }}>
              {dialogTitles[dialog.type]}
            </h2>
            <p className="meta" style={{ margin: "0 0 12px" }}>
              Applicant: <strong>{dialog.appName}</strong>
            </p>
            <textarea
              value={dialog.message}
              onChange={(e) => setDialog({ ...dialog, message: e.target.value })}
              placeholder={dialog.type === "request_info" ? "What additional information do you need?" : ""}
              rows={8}
              style={{
                width: "100%", padding: 10, borderRadius: 6,
                border: "1px solid var(--border-color, #ccc)",
                fontFamily: "inherit", fontSize: "0.9rem", resize: "vertical",
                background: "var(--input-bg, #fff)", color: "var(--text-color, #333)",
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setDialog(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={dialogBtnClass[dialog.type]}
                onClick={() => void submitDialog()}
                disabled={submitting || (dialog.type === "request_info" && !dialog.message.trim())}
                style={dialog.type === "reject" ? { background: "#c0392b", borderColor: "#c0392b" } : undefined}
              >
                {submitting ? "Sending..." : dialogActions[dialog.type]}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

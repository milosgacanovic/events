"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
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

export default function AdminApplicationsPage() {
  const { getToken } = useKeycloakAuth();
  const [apps, setApps] = useState<ApplicationItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState("");

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

  async function updateStatus(id: string, status: string) {
    try {
      await authorizedPatch(getToken, `/admin/applications/${id}`, { status });
      setActionStatus(`Application ${status}`);
      void load();
    } catch (err) {
      setActionStatus(`Error: ${err instanceof Error ? err.message : "Failed"}`);
    }
  }

  return (
    <div>
      <h1 className="manage-page-title">Applications (Admin)</h1>

      <div className="manage-filter-bar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
      </div>

      {loading ? (
        <div className="manage-loading">Loading...</div>
      ) : apps.length === 0 ? (
        <div className="manage-empty">
          <h3>No applications</h3>
          <p>No {statusFilter || ""} applications found.</p>
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
                Intent: {app.intent}{app.intent_other ? ` — ${app.intent_other}` : ""}
              </div>
              {app.description && <div className="meta" style={{ marginTop: 4 }}>{app.description}</div>}
              {app.proof_url && (
                <div className="meta">
                  Link: <a href={app.proof_url} target="_blank" rel="noopener noreferrer">{app.proof_url}</a>
                </div>
              )}
              <div className="meta">Applied {new Date(app.created_at).toLocaleDateString()}</div>
              {app.status === "pending" && (
                <div className="manage-event-card-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="primary-btn" style={{ fontSize: "0.85rem" }} onClick={() => void updateStatus(app.id, "approved")}>
                    Approve
                  </button>
                  <button type="button" className="ghost-btn" style={{ fontSize: "0.85rem" }} onClick={() => void updateStatus(app.id, "rejected")}>
                    Reject
                  </button>
                  <button type="button" className="secondary-btn" style={{ fontSize: "0.85rem" }} onClick={() => void updateStatus(app.id, "more_info")}>
                    Request Info
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {actionStatus && <div className="meta" style={{ padding: "8px 0" }}>{actionStatus}</div>}
    </div>
  );
}

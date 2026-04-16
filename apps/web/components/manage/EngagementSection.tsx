"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../auth/KeycloakAuthProvider";
import { useI18n } from "../i18n/I18nProvider";
import { authorizedGet } from "../../lib/manageApi";

type RsvpRow = { id: string; user_name: string; user_id: string; created_at: string };
type CommentRow = { id: string; user_name: string; body: string; status: string; created_at: string };
type ReportRow = { id: string; reporter_name: string; reason: string; detail: string | null; status: string; created_at: string };
type FollowerRow = { id: string; user_name: string; user_id: string; created_at: string };

type EventEngagement = {
  counts: { save_count: number; rsvp_count: number; comment_count: number; report_count: number };
  rsvps: RsvpRow[];
  comments: CommentRow[];
  reports: ReportRow[];
};

type HostEngagement = {
  counts: { follower_count: number; comment_count: number; report_count: number };
  followers: FollowerRow[];
  reports: ReportRow[];
};

export function EventEngagementSection({ eventId }: { eventId: string }) {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const [data, setData] = useState<EventEngagement | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await authorizedGet<EventEngagement>(getToken, `/admin/events/${eventId}/engagement`);
      setData(d);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [getToken, eventId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return null;
  if (!data) return null;

  const c = data.counts;
  const hasAny = c.save_count > 0 || c.rsvp_count > 0 || c.comment_count > 0 || c.report_count > 0;
  if (!hasAny) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h2 className="title-l">{t("manage.engagement.title")}</h2>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard label={t("manage.engagement.saves")} value={c.save_count} />
        <StatCard label={t("manage.engagement.rsvps")} value={c.rsvp_count} />
        <StatCard label={t("manage.engagement.comments")} value={c.comment_count} />
        <StatCard label={t("manage.engagement.reports")} value={c.report_count} danger={c.report_count > 0} />
      </div>

      {data.rsvps.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary className="meta" style={{ cursor: "pointer", fontWeight: 600 }}>
            {t("manage.engagement.rsvpList")} ({data.rsvps.length})
          </summary>
          <ul style={{ listStyle: "none", padding: 0, marginTop: 4 }}>
            {data.rsvps.map((r) => (
              <li key={r.id} className="meta" style={{ padding: "2px 0" }}>
                <a href={`/manage/admin/users/${r.user_id}`}>{r.user_name}</a>
                <span style={{ marginLeft: 8, opacity: 0.7 }}>{new Date(r.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {data.comments.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary className="meta" style={{ cursor: "pointer", fontWeight: 600 }}>
            {t("manage.engagement.commentList")} ({data.comments.length})
          </summary>
          <div className="manage-table-wrap" style={{ marginTop: 4 }}>
            <table className="manage-table">
              <thead>
                <tr>
                  <th>{t("manage.admin.moderation.user")}</th>
                  <th>{t("manage.admin.moderation.content")}</th>
                  <th>{t("manage.common.status")}</th>
                  <th>{t("manage.admin.moderation.date")}</th>
                </tr>
              </thead>
              <tbody>
                {data.comments.map((c) => (
                  <tr key={c.id}>
                    <td>{c.user_name}</td>
                    <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.body}</td>
                    <td><span className={`tag tag--${c.status}`} style={{ fontSize: "0.7rem" }}>{c.status}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {data.reports.length > 0 && (
        <ReportsSection reports={data.reports} />
      )}
    </div>
  );
}

export function HostEngagementSection({ hostId }: { hostId: string }) {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const [data, setData] = useState<HostEngagement | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await authorizedGet<HostEngagement>(getToken, `/admin/organizers/${hostId}/engagement`);
      setData(d);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [getToken, hostId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return null;
  if (!data) return null;

  const c = data.counts;
  const hasAny = c.follower_count > 0 || c.comment_count > 0 || c.report_count > 0;
  if (!hasAny) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h2 className="title-l">{t("manage.engagement.title")}</h2>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard label={t("manage.engagement.followers")} value={c.follower_count} />
        <StatCard label={t("manage.engagement.comments")} value={c.comment_count} />
        <StatCard label={t("manage.engagement.reports")} value={c.report_count} danger={c.report_count > 0} />
      </div>

      {data.followers.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary className="meta" style={{ cursor: "pointer", fontWeight: 600 }}>
            {t("manage.engagement.followerList")} ({data.followers.length})
          </summary>
          <ul style={{ listStyle: "none", padding: 0, marginTop: 4 }}>
            {data.followers.map((f) => (
              <li key={f.id} className="meta" style={{ padding: "2px 0" }}>
                <a href={`/manage/admin/users/${f.user_id}`}>{f.user_name}</a>
                <span style={{ marginLeft: 8, opacity: 0.7 }}>{new Date(f.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {data.reports.length > 0 && (
        <ReportsSection reports={data.reports} />
      )}
    </div>
  );
}

function StatCard({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div style={{
      padding: "8px 16px", borderRadius: 8,
      border: `1px solid ${danger ? "var(--danger, #dc2626)" : "var(--border)"}`,
      background: danger ? "rgba(220, 38, 38, 0.05)" : undefined,
      minWidth: 80, textAlign: "center",
    }}>
      <div style={{ fontSize: "1.3rem", fontWeight: 700, color: danger ? "var(--danger, #dc2626)" : undefined }}>{value}</div>
      <div className="meta" style={{ fontSize: "0.75rem" }}>{label}</div>
    </div>
  );
}

function ReportsSection({ reports }: { reports: ReportRow[] }) {
  const { t } = useI18n();
  return (
    <details style={{ marginBottom: 12 }}>
      <summary className="meta" style={{ cursor: "pointer", fontWeight: 600, color: "var(--danger, #dc2626)" }}>
        {t("manage.engagement.reportList")} ({reports.length})
      </summary>
      <div className="manage-table-wrap" style={{ marginTop: 4 }}>
        <table className="manage-table">
          <thead>
            <tr>
              <th>{t("manage.admin.moderation.user")}</th>
              <th>Reason</th>
              <th>{t("manage.admin.moderation.content")}</th>
              <th>{t("manage.common.status")}</th>
              <th>{t("manage.admin.moderation.date")}</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.reporter_name}</td>
                <td>{r.reason}</td>
                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.detail ?? "\u2014"}</td>
                <td><span className={`tag tag--${r.status}`} style={{ fontSize: "0.7rem" }}>{r.status}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { useKeycloakAuth } from "../../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../../components/i18n/I18nProvider";
import { authorizedGet, authorizedPatch } from "../../../../../lib/manageApi";

type SaveItem = { id: string; event_id: string; event_title: string; event_slug: string; scope: string; created_at: string };
type RsvpItem = { id: string; event_id: string; event_title: string; event_slug: string; created_at: string };
type FollowItem = { id: string; organizer_id: string; organizer_name: string; radius_km: number; unsubscribed_at: string | null; created_at: string };
type CommentItem = { id: string; event_id: string; event_title: string; body: string; status: string; created_at: string };
type ReportItem = { id: string; target_type: string; target_id: string; target_name: string; reason: string; detail: string | null; status: string; created_at: string };
type RecommendationItem = { id: string; recipient_email: string; event_id: string; event_title: string; note: string | null; created_at: string };
type SuggestionItem = { id: string; target_type: string; target_id: string; target_name: string; category: string; body: string; status: string; created_at: string };
type LinkedHost = { organizer_id: string; organizer_name: string };
type LinkedEvent = { id: string; title: string; status: string };

type UserDetail = {
  id: string;
  keycloak_sub: string;
  display_name: string | null;
  email: string | null;
  roles: string[];
  created_at: string;
  is_service_account: boolean;
  admin_notes: string;
  suspended_at: string | null;
  saves: SaveItem[];
  rsvps: RsvpItem[];
  follows: FollowItem[];
  comments: CommentItem[];
  reports: ReportItem[];
  recommendations: RecommendationItem[];
  suggestions: SuggestionItem[];
  linkedHosts: LinkedHost[];
  linkedEvents: LinkedEvent[];
};

type Tab = "saves" | "rsvps" | "follows" | "comments" | "reports" | "recommendations" | "suggestions" | "hosts" | "events";

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("saves");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await authorizedGet<UserDetail>(getToken, `/admin/users/${id}`);
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user");
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => { void load(); }, [load]);

  async function toggleSuspend() {
    if (!user) return;
    const suspended = !user.suspended_at;
    if (suspended && !confirm(t("manage.admin.users.confirmSuspend"))) return;
    try {
      await authorizedPatch(getToken, `/admin/users/${user.id}/suspend`, { suspended });
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (loading) return <div className="manage-loading">{t("manage.admin.users.loadingUsers")}</div>;
  if (error) return <div className="manage-empty"><p>{error}</p></div>;
  if (!user) return <div className="manage-empty"><p>User not found</p></div>;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "saves", label: t("manage.admin.users.saves"), count: user.saves.length },
    { key: "rsvps", label: t("manage.admin.users.rsvps"), count: user.rsvps.length },
    { key: "follows", label: t("manage.admin.users.follows"), count: user.follows.length },
    { key: "comments", label: t("manage.admin.users.commentsCol"), count: user.comments.length },
    { key: "reports", label: t("manage.admin.users.reportsSubmitted"), count: user.reports.length },
    { key: "recommendations", label: t("manage.admin.users.recommendationsSent"), count: user.recommendations.length },
    { key: "suggestions", label: t("manage.admin.users.editSuggestions"), count: user.suggestions.length },
    { key: "hosts", label: t("manage.admin.users.hosts"), count: user.linkedHosts.length },
    { key: "events", label: t("manage.admin.users.events"), count: user.linkedEvents.length },
  ];

  return (
    <div>
      <Link href="/manage/admin/users" style={{ fontSize: "0.85rem", color: "var(--muted)", textDecoration: "none", marginBottom: 12, display: "inline-block" }}>
        &larr; {t("manage.admin.users.title")}
      </Link>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", fontWeight: 600, color: "var(--accent)", flexShrink: 0 }}>
          {(user.display_name ?? user.email ?? "?")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: "1.3rem" }}>
            {user.display_name ?? user.keycloak_sub.slice(0, 16)}
          </h1>
          <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            {user.email ?? "\u2014"}
            {" \u00B7 "}
            {t("manage.admin.users.joined")} {new Date(user.created_at).toLocaleDateString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {user.roles.filter((r) => r === "admin" || r === "editor").map((r) => (
            <span key={r} className={`tag tag--${r}`} style={{ fontSize: "0.7rem" }}>{r}</span>
          ))}
          {user.is_service_account && (
            <span className="tag" style={{ fontSize: "0.65rem" }}>{t("manage.admin.users.serviceAccount")}</span>
          )}
          {user.suspended_at && (
            <span className="tag" style={{ fontSize: "0.65rem", background: "#fef2f2", borderColor: "#dc2626", color: "#dc2626" }}>
              {t("manage.admin.users.suspended")}
            </span>
          )}
        </div>
      </div>

      {/* Engagement stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: t("manage.admin.users.saves"), value: user.saves.length },
          { label: t("manage.admin.users.rsvps"), value: user.rsvps.length },
          { label: t("manage.admin.users.follows"), value: user.follows.length },
          { label: t("manage.admin.users.commentsCol"), value: user.comments.length },
          { label: t("manage.admin.users.reportsSubmitted"), value: user.reports.length },
          { label: t("manage.admin.users.recommendationsSent"), value: user.recommendations.length },
          { label: t("manage.admin.users.editSuggestions"), value: user.suggestions.length },
        ].map((stat) => (
          <div key={stat.label} style={{ padding: "12px 16px", border: "1px solid var(--border)", borderRadius: 8, textAlign: "center" }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{stat.value}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button type="button" className="secondary-btn" onClick={() => void toggleSuspend()} style={user.suspended_at ? {} : { color: "var(--danger, #c53030)" }}>
          {user.suspended_at ? t("manage.admin.users.unsuspend") : t("manage.admin.users.suspend")}
        </button>
      </div>

      {/* Tabs */}
      <div className="manage-status-pills" style={{ marginBottom: 16 }}>
        {tabs.map((tb) => (
          <button key={tb.key} type="button" data-active={tab === tb.key} onClick={() => setTab(tb.key)}>
            {tb.label}{tb.count > 0 ? ` (${tb.count})` : ""}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "saves" && (
        <div>
          {user.saves.length === 0 ? (
            <p className="meta">{t("manage.admin.users.noData")}</p>
          ) : (
            <table className="manage-table">
              <thead>
                <tr>
                  <th>{t("manage.admin.users.eventName")}</th>
                  <th>{t("manage.admin.users.scope")}</th>
                  <th>{t("manage.admin.users.date")}</th>
                </tr>
              </thead>
              <tbody>
                {user.saves.map((s) => (
                  <tr key={s.id}>
                    <td><Link href={`/events/${s.event_slug}`} target="_blank">{s.event_title}</Link></td>
                    <td>{s.scope}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(s.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "rsvps" && (
        <div>
          {user.rsvps.length === 0 ? (
            <p className="meta">{t("manage.admin.users.noData")}</p>
          ) : (
            <table className="manage-table">
              <thead>
                <tr>
                  <th>{t("manage.admin.users.eventName")}</th>
                  <th>{t("manage.admin.users.date")}</th>
                </tr>
              </thead>
              <tbody>
                {user.rsvps.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/events/${r.event_slug}`} target="_blank">{r.event_title}</Link></td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "follows" && (
        <div>
          {user.follows.length === 0 ? (
            <p className="meta">{t("manage.admin.users.noData")}</p>
          ) : (
            <table className="manage-table">
              <thead>
                <tr>
                  <th>{t("manage.admin.users.hostName")}</th>
                  <th>{t("manage.admin.users.radius")}</th>
                  <th>{t("manage.common.status")}</th>
                  <th>{t("manage.admin.users.date")}</th>
                </tr>
              </thead>
              <tbody>
                {user.follows.map((f) => (
                  <tr key={f.id}>
                    <td>{f.organizer_name}</td>
                    <td>{f.radius_km} km</td>
                    <td>{f.unsubscribed_at ? t("manage.admin.users.unsubscribed") : t("manage.admin.users.active")}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(f.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "comments" && (
        <div>
          {user.comments.length === 0 ? (
            <p className="meta">{t("manage.admin.users.noData")}</p>
          ) : (
            <table className="manage-table">
              <thead>
                <tr>
                  <th>{t("manage.admin.users.eventName")}</th>
                  <th>{t("manage.admin.users.comment")}</th>
                  <th>{t("manage.common.status")}</th>
                  <th>{t("manage.admin.users.date")}</th>
                </tr>
              </thead>
              <tbody>
                {user.comments.map((c) => (
                  <tr key={c.id}>
                    <td>{c.event_title}</td>
                    <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.body}</td>
                    <td><span className={`tag tag--${c.status}`} style={{ fontSize: "0.7rem" }}>{c.status}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "reports" && (
        <div>
          {user.reports.length === 0 ? (
            <p className="meta">{t("manage.admin.users.noData")}</p>
          ) : (
            <table className="manage-table">
              <thead>
                <tr>
                  <th>{t("manage.admin.users.target")}</th>
                  <th>{t("manage.admin.users.reason")}</th>
                  <th>{t("manage.common.status")}</th>
                  <th>{t("manage.admin.users.date")}</th>
                </tr>
              </thead>
              <tbody>
                {user.reports.map((r) => (
                  <tr key={r.id}>
                    <td>{r.target_name} <span className="meta">({r.target_type})</span></td>
                    <td>{r.reason}</td>
                    <td><span className={`tag tag--${r.status}`} style={{ fontSize: "0.7rem" }}>{r.status}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "recommendations" && (
        <div>
          {user.recommendations.length === 0 ? (
            <p className="meta">{t("manage.admin.users.noData")}</p>
          ) : (
            <table className="manage-table">
              <thead>
                <tr>
                  <th>{t("manage.admin.referrals.recipient")}</th>
                  <th>{t("manage.admin.referrals.event")}</th>
                  <th>{t("manage.admin.referrals.note")}</th>
                  <th>{t("manage.admin.users.date")}</th>
                </tr>
              </thead>
              <tbody>
                {user.recommendations.map((r) => (
                  <tr key={r.id}>
                    <td>{r.recipient_email}</td>
                    <td>{r.event_title}</td>
                    <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note ?? "\u2014"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "suggestions" && (
        <div>
          {user.suggestions.length === 0 ? (
            <p className="meta">{t("manage.admin.users.noData")}</p>
          ) : (
            <table className="manage-table">
              <thead>
                <tr>
                  <th>{t("manage.admin.users.target")}</th>
                  <th>{t("manage.admin.users.field")}</th>
                  <th>{t("manage.admin.users.suggestion")}</th>
                  <th>{t("manage.common.status")}</th>
                  <th>{t("manage.admin.users.date")}</th>
                </tr>
              </thead>
              <tbody>
                {user.suggestions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.target_name} <span className="meta">({s.target_type})</span></td>
                    <td>{s.category}</td>
                    <td style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.body}</td>
                    <td><span className={`tag tag--${s.status}`} style={{ fontSize: "0.7rem" }}>{s.status}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(s.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "hosts" && (
        <div>
          {user.linkedHosts.length === 0 ? (
            <p className="meta">{t("manage.admin.users.noLinkedHosts")}</p>
          ) : (
            <table className="manage-table">
              <thead>
                <tr>
                  <th>{t("manage.admin.users.hostName")}</th>
                </tr>
              </thead>
              <tbody>
                {user.linkedHosts.map((h) => (
                  <tr key={h.organizer_id}>
                    <td><Link href={`/manage/admin/hosts?q=${encodeURIComponent(h.organizer_name)}`}>{h.organizer_name}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "events" && (
        <div>
          {user.linkedEvents.length === 0 ? (
            <p className="meta">{t("manage.admin.users.noLinkedEvents")}</p>
          ) : (
            <table className="manage-table">
              <thead>
                <tr>
                  <th>{t("manage.admin.users.eventName")}</th>
                  <th>{t("manage.common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {user.linkedEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td><Link href={`/manage/admin/events?q=${encodeURIComponent(ev.title)}`}>{ev.title}</Link></td>
                    <td><span className={`tag tag--${ev.status}`} style={{ fontSize: "0.7rem" }}>{ev.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Notes */}
      {user.admin_notes && (
        <div style={{ marginTop: 24, padding: 16, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
          <h4 style={{ margin: "0 0 8px" }}>{t("manage.admin.users.notes")}</h4>
          <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>{user.admin_notes}</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ROLE_ADMIN, ROLE_EDITOR } from "@dr-events/shared";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { authorizedDelete, authorizedGet, authorizedPatch, authorizedPost } from "../../../../lib/manageApi";

type UserItem = {
  id: string;
  keycloak_sub: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
  host_count: number;
  event_count: number;
  keycloak_roles?: string[];
};

type UsersResponse = {
  items: UserItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

type LinkedHost = { id: string; organizer_id: string; organizer_name: string };
type LinkedEvent = { id: string; title: string; status: string };

export default function AdminUsersPage() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Role editing
  const [editRolesUserId, setEditRolesUserId] = useState<string | null>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const roleDialogRef = useRef<HTMLDialogElement>(null);

  // Access management
  const [accessUserId, setAccessUserId] = useState<string | null>(null);
  const [linkedHosts, setLinkedHosts] = useState<LinkedHost[]>([]);
  const [linkedEvents, setLinkedEvents] = useState<LinkedEvent[]>([]);
  const accessDialogRef = useRef<HTMLDialogElement>(null);

  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (search) params.set("search", search);
      const data = await authorizedGet<UsersResponse>(getToken, `/admin/users?${params}`);
      setUsers(data.items);
      setTotalItems(data.pagination.totalItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [getToken, page, search]);

  useEffect(() => { void load(); }, [load]);

  function openRoleEdit(user: UserItem) {
    setEditRolesUserId(user.id);
    setEditRoles(user.keycloak_roles ?? []);
    setTimeout(() => roleDialogRef.current?.showModal(), 0);
  }

  async function saveRoles() {
    if (!editRolesUserId) return;
    const user = users.find((u) => u.id === editRolesUserId);
    const currentRoles = user?.keycloak_roles ?? [];
    const toAdd = editRoles.filter((r) => !currentRoles.includes(r));
    const toRemove = currentRoles.filter((r) => !editRoles.includes(r));

    try {
      await authorizedPatch(getToken, `/admin/users/${editRolesUserId}/roles`, {
        add: toAdd.length ? toAdd : undefined,
        remove: toRemove.length ? toRemove : undefined,
      });
      roleDialogRef.current?.close();
      setEditRolesUserId(null);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update roles");
    }
  }

  // Access dialog search state
  const [accessHostSearch, setAccessHostSearch] = useState("");
  const [accessHostResults, setAccessHostResults] = useState<Array<{ id: string; name: string }>>([]);
  const [accessEventSearch, setAccessEventSearch] = useState("");
  const [accessEventResults, setAccessEventResults] = useState<Array<{ id: string; title: string }>>([]);

  async function openAccessManage(userId: string) {
    setAccessUserId(userId);
    setLinkedHosts([]);
    setLinkedEvents([]);
    setAccessHostSearch("");
    setAccessHostResults([]);
    setAccessEventSearch("");
    setAccessEventResults([]);
    setTimeout(() => accessDialogRef.current?.showModal(), 0);

    try {
      const [hosts, events] = await Promise.all([
        authorizedGet<LinkedHost[]>(getToken, `/admin/users/${userId}/hosts`),
        authorizedGet<LinkedEvent[]>(getToken, `/admin/users/${userId}/events`),
      ]);
      setLinkedHosts(hosts);
      setLinkedEvents(events);
    } catch {
      // ignore
    }
  }

  async function searchHostsForAccess(q: string) {
    if (q.length < 2) { setAccessHostResults([]); return; }
    try {
      const data = await authorizedGet<{ items: Array<{ id: string; name: string }> }>(
        getToken, `/admin/organizers?q=${encodeURIComponent(q)}&pageSize=5&showArchived=true`,
      );
      setAccessHostResults(data.items ?? []);
    } catch { /* ignore */ }
  }

  async function searchEventsForAccess(q: string) {
    if (q.length < 2) { setAccessEventResults([]); return; }
    try {
      const data = await authorizedGet<{ items: Array<{ id: string; title: string }> }>(
        getToken, `/admin/events?q=${encodeURIComponent(q)}&pageSize=5&showUnlisted=true`,
      );
      setAccessEventResults(data.items ?? []);
    } catch { /* ignore */ }
  }

  async function addEventToUser(userId: string, eventId: string) {
    try {
      await authorizedPost(getToken, `/admin/users/${userId}/events`, { eventId });
      const events = await authorizedGet<LinkedEvent[]>(getToken, `/admin/users/${userId}/events`);
      setLinkedEvents(events);
      setAccessEventSearch("");
      setAccessEventResults([]);
      void load();
    } catch { /* ignore */ }
  }

  async function removeEventFromUser(userId: string, eventId: string) {
    try {
      await authorizedDelete(getToken, `/admin/users/${userId}/events/${eventId}`);
      setLinkedEvents((prev) => prev.filter((e) => e.id !== eventId));
      void load();
    } catch { /* ignore */ }
  }

  async function addHostToUser(userId: string, organizerId: string) {
    try {
      await authorizedPost(getToken, `/admin/users/${userId}/hosts`, { organizerId });
      const hosts = await authorizedGet<LinkedHost[]>(getToken, `/admin/users/${userId}/hosts`);
      setLinkedHosts(hosts);
      setAccessHostSearch("");
      setAccessHostResults([]);
      void load();
    } catch {
      // ignore
    }
  }

  async function removeHostFromUser(userId: string, hostId: string) {
    try {
      await authorizedDelete(getToken, `/admin/users/${userId}/hosts/${hostId}`);
      setLinkedHosts((prev) => prev.filter((h) => h.organizer_id !== hostId));
      void load();
    } catch {
      // ignore
    }
  }

  function toggleRole(role: string) {
    setEditRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  return (
    <div>
      <h1 className="manage-page-title">{t("manage.admin.users.title")}</h1>

      <div className="manage-filter-bar">
        <input
          placeholder={t("manage.admin.users.searchPlaceholder")}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        {totalItems > 0 && <span className="meta">{t("manage.pagination.showing", { start: (page - 1) * 20 + 1, end: (page - 1) * 20 + users.length, total: totalItems })}</span>}
        {process.env.NEXT_PUBLIC_KEYCLOAK_ADMIN_URL && (
          <a href={process.env.NEXT_PUBLIC_KEYCLOAK_ADMIN_URL} target="_blank" rel="noopener noreferrer" className="ghost-btn" style={{ fontSize: "0.8rem", marginLeft: "auto" }}>
            {t("manage.admin.users.inviteUser")}
          </a>
        )}
      </div>

      {error && (
        <div className="manage-empty">
          <p>{error}</p>
          <button type="button" className="secondary-btn" onClick={() => void load()} style={{ marginTop: 8 }}>{t("manage.error.retry")}</button>
        </div>
      )}

      {!error && loading ? (
        <div className="manage-loading">{t("manage.admin.users.loadingUsers")}</div>
      ) : !error && users.length === 0 ? (
        <div className="manage-empty">
          <h3>{t("manage.admin.users.noUsers")}</h3>
        </div>
      ) : !error ? (
        <>
          <div style={{ overflowX: "auto" }}>
          <table className="manage-table">
            <thead>
              <tr>
                <th>{t("manage.admin.users.name")}</th>
                <th>{t("manage.admin.users.email")}</th>
                <th>{t("manage.common.roles")}</th>
                <th className="text-center">{t("manage.admin.users.hosts")}</th>
                <th className="text-center">{t("manage.admin.users.events")}</th>
                <th>{t("manage.admin.users.joined")}</th>
                <th className="text-right">{t("manage.admin.users.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    {user.display_name ?? user.email ?? user.keycloak_sub.slice(0, 16)}
                  </td>
                  <td>
                    {user.email ?? "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(user.keycloak_roles ?? []).filter((r) => r === "admin" || r === "editor").map((r) => (
                        <span key={r} className="tag" style={{ fontSize: "0.7rem" }}>
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="text-center">
                    {user.host_count}
                  </td>
                  <td className="text-center">
                    {user.event_count}
                  </td>
                  <td>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="ghost-btn"
                      style={{ fontSize: "0.75rem", marginRight: 4 }}
                      onClick={() => openRoleEdit(user)}
                    >
                      {t("manage.common.roles")}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      style={{ fontSize: "0.75rem" }}
                      onClick={() => void openAccessManage(user.id)}
                    >
                      {t("manage.common.access")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {(page > 1 || users.length === 20) && (
            <div className="manage-pagination">
              {page > 1 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>{t("manage.common.previous")}</button>}
              {users.length === 20 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>{t("manage.common.next")}</button>}
            </div>
          )}
        </>
      ) : null}

      {/* Role editing dialog */}
      <dialog ref={roleDialogRef} className="manage-dialog">
        <h3>{t("manage.admin.users.editRoles")}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[ROLE_EDITOR, ROLE_ADMIN].map((role) => (
            <label key={role} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={editRoles.includes(role)}
                onChange={() => toggleRole(role)}
              />
              {role}
            </label>
          ))}
        </div>
        <div className="manage-dialog-actions">
          <button type="button" className="ghost-btn" onClick={() => roleDialogRef.current?.close()}>
            {t("manage.common.cancel")}
          </button>
          <button type="button" className="primary-btn" onClick={() => void saveRoles()}>
            {t("manage.common.save")}
          </button>
        </div>
      </dialog>

      {/* Access management dialog */}
      <dialog ref={accessDialogRef} className="manage-dialog manage-dialog--wide">
        <h3>{t("manage.admin.users.manageAccess")}</h3>

        {/* Linked Hosts */}
        <h4 style={{ marginBottom: 8 }}>{t("manage.admin.users.linkedHosts")}</h4>
        {linkedHosts.length === 0 ? (
          <p className="meta" style={{ fontSize: "0.85rem" }}>{t("manage.admin.users.noLinkedHosts")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {linkedHosts.map((h) => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.9rem" }}>{h.organizer_name}</span>
                <button type="button" className="ghost-btn" style={{ fontSize: "0.75rem", color: "var(--danger, #c53030)" }} onClick={() => void removeHostFromUser(accessUserId!, h.organizer_id)}>
                  {t("manage.common.remove")}
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <input
            placeholder={t("manage.admin.users.searchHostsToAdd")}
            value={accessHostSearch}
            onChange={(e) => { setAccessHostSearch(e.target.value); void searchHostsForAccess(e.target.value); }}
            style={{ width: "100%", fontSize: "0.85rem" }}
          />
          {accessHostResults.length > 0 && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 4, maxHeight: 150, overflow: "auto", marginTop: 4 }}>
              {accessHostResults.map((h) => (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => void addHostToUser(accessUserId!, h.id)}>
                  <span style={{ fontSize: "0.85rem" }}>{h.name}</span>
                  <span className="meta" style={{ fontSize: "0.75rem" }}>+ {t("manage.common.add")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Linked Events */}
        <h4 style={{ marginBottom: 8 }}>{t("manage.admin.users.linkedEvents")}</h4>
        {linkedEvents.length === 0 ? (
          <p className="meta" style={{ fontSize: "0.85rem" }}>{t("manage.admin.users.noLinkedEvents")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {linkedEvents.map((ev) => (
              <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.9rem" }}>{ev.title} <span className="meta">({ev.status})</span></span>
                <button type="button" className="ghost-btn" style={{ fontSize: "0.75rem", color: "var(--danger, #c53030)" }} onClick={() => void removeEventFromUser(accessUserId!, ev.id)}>
                  {t("manage.common.remove")}
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <input
            placeholder={t("manage.admin.users.searchEventsToAdd")}
            value={accessEventSearch}
            onChange={(e) => { setAccessEventSearch(e.target.value); void searchEventsForAccess(e.target.value); }}
            style={{ width: "100%", fontSize: "0.85rem" }}
          />
          {accessEventResults.length > 0 && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 4, maxHeight: 150, overflow: "auto", marginTop: 4 }}>
              {accessEventResults.map((ev) => (
                <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => void addEventToUser(accessUserId!, ev.id)}>
                  <span style={{ fontSize: "0.85rem" }}>{ev.title}</span>
                  <span className="meta" style={{ fontSize: "0.75rem" }}>+ {t("manage.common.add")}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="manage-dialog-actions">
          <button type="button" className="ghost-btn" onClick={() => accessDialogRef.current?.close()}>
            {t("manage.common.close")}
          </button>
        </div>
      </dialog>
    </div>
  );
}

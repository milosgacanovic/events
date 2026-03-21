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
    } catch {
      // ignore
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
      // refresh linked data
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
          placeholder="Search users..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        {totalItems > 0 && <span className="meta">Showing {(page - 1) * 20 + 1}–{(page - 1) * 20 + users.length} of {totalItems}</span>}
        {process.env.NEXT_PUBLIC_KEYCLOAK_ADMIN_URL && (
          <a href={process.env.NEXT_PUBLIC_KEYCLOAK_ADMIN_URL} target="_blank" rel="noopener noreferrer" className="ghost-btn" style={{ fontSize: "0.8rem", marginLeft: "auto" }}>
            Invite user (Keycloak)
          </a>
        )}
      </div>

      {error && (
        <div className="manage-empty">
          <p>{error}</p>
          <button type="button" className="secondary-btn" onClick={() => void load()} style={{ marginTop: 8 }}>Retry</button>
        </div>
      )}

      {!error && loading ? (
        <div className="manage-loading">Loading users...</div>
      ) : !error && users.length === 0 ? (
        <div className="manage-empty">
          <h3>No users found</h3>
        </div>
      ) : !error ? (
        <>
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid var(--border)" }}>Name</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid var(--border)" }}>Email</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid var(--border)" }}>Roles</th>
                <th style={{ textAlign: "center", padding: "8px", borderBottom: "1px solid var(--border)" }}>Hosts</th>
                <th style={{ textAlign: "center", padding: "8px", borderBottom: "1px solid var(--border)" }}>Events</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid var(--border)" }}>Joined</th>
                <th style={{ textAlign: "right", padding: "8px", borderBottom: "1px solid var(--border)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>
                    {user.display_name ?? user.email ?? user.keycloak_sub.slice(0, 16)}
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>
                    {user.email ?? "—"}
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(user.keycloak_roles ?? []).filter((r) => r.startsWith("dr_events_")).map((r) => (
                        <span key={r} className="tag" style={{ fontSize: "0.7rem" }}>
                          {r.replace("dr_events_", "")}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    {user.host_count}
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    {user.event_count}
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "8px", borderBottom: "1px solid var(--border)", textAlign: "right" }}>
                    <button
                      type="button"
                      className="ghost-btn"
                      style={{ fontSize: "0.75rem", marginRight: 4 }}
                      onClick={() => openRoleEdit(user)}
                    >
                      Roles
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      style={{ fontSize: "0.75rem" }}
                      onClick={() => void openAccessManage(user.id)}
                    >
                      Access
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {(page > 1 || users.length === 20) && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
              {page > 1 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>Previous</button>}
              {users.length === 20 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>Next</button>}
            </div>
          )}
        </>
      ) : null}

      {/* Role editing dialog */}
      <dialog ref={roleDialogRef} style={{ padding: 24, borderRadius: 8, border: "1px solid var(--border)", maxWidth: 400 }}>
        <h3 style={{ marginTop: 0 }}>Edit Roles</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[ROLE_EDITOR, ROLE_ADMIN].map((role) => (
            <label key={role} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={editRoles.includes(role)}
                onChange={() => toggleRole(role)}
              />
              {role.replace("dr_events_", "")}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="ghost-btn" onClick={() => roleDialogRef.current?.close()}>
            Cancel
          </button>
          <button type="button" className="primary-btn" onClick={() => void saveRoles()}>
            Save
          </button>
        </div>
      </dialog>

      {/* Access management dialog */}
      <dialog ref={accessDialogRef} style={{ padding: 24, borderRadius: 8, border: "1px solid var(--border)", maxWidth: 560, width: "100%" }}>
        <h3 style={{ marginTop: 0 }}>Manage Access</h3>

        {/* Linked Hosts */}
        <h4 style={{ marginBottom: 8 }}>Linked Hosts</h4>
        {linkedHosts.length === 0 ? (
          <p className="meta" style={{ fontSize: "0.85rem" }}>No linked hosts</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {linkedHosts.map((h) => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.9rem" }}>{h.organizer_name}</span>
                <button type="button" className="ghost-btn" style={{ fontSize: "0.75rem", color: "var(--danger, #c53030)" }} onClick={() => void removeHostFromUser(accessUserId!, h.organizer_id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <input
            placeholder="Search hosts to add..."
            value={accessHostSearch}
            onChange={(e) => { setAccessHostSearch(e.target.value); void searchHostsForAccess(e.target.value); }}
            style={{ width: "100%", fontSize: "0.85rem" }}
          />
          {accessHostResults.length > 0 && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 4, maxHeight: 150, overflow: "auto", marginTop: 4 }}>
              {accessHostResults.map((h) => (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => void addHostToUser(accessUserId!, h.id)}>
                  <span style={{ fontSize: "0.85rem" }}>{h.name}</span>
                  <span className="meta" style={{ fontSize: "0.75rem" }}>+ Add</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Linked Events */}
        <h4 style={{ marginBottom: 8 }}>Linked Events</h4>
        {linkedEvents.length === 0 ? (
          <p className="meta" style={{ fontSize: "0.85rem" }}>No linked events</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {linkedEvents.map((ev) => (
              <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.9rem" }}>{ev.title} <span className="meta">({ev.status})</span></span>
                <button type="button" className="ghost-btn" style={{ fontSize: "0.75rem", color: "var(--danger, #c53030)" }} onClick={() => void removeEventFromUser(accessUserId!, ev.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <input
            placeholder="Search events to add..."
            value={accessEventSearch}
            onChange={(e) => { setAccessEventSearch(e.target.value); void searchEventsForAccess(e.target.value); }}
            style={{ width: "100%", fontSize: "0.85rem" }}
          />
          {accessEventResults.length > 0 && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 4, maxHeight: 150, overflow: "auto", marginTop: 4 }}>
              {accessEventResults.map((ev) => (
                <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => void addEventToUser(accessUserId!, ev.id)}>
                  <span style={{ fontSize: "0.85rem" }}>{ev.title}</span>
                  <span className="meta" style={{ fontSize: "0.75rem" }}>+ Add</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="ghost-btn" onClick={() => accessDialogRef.current?.close()}>
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
}

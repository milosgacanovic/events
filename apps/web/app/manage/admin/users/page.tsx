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
  is_service_account?: boolean;
  admin_notes?: string;
};

type UsersResponse = {
  items: UserItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

type LinkedHost = { id: string; organizer_id: string; organizer_name: string };
type LinkedEvent = { id: string; title: string; status: string };

type SortKey = "created" | "name" | "email" | "hosts" | "events";

export default function AdminUsersPage() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [roleFilter, setRoleFilter] = useState("");
  const [hasNotesFilter, setHasNotesFilter] = useState(false);

  // Role editing
  const [editRolesUserId, setEditRolesUserId] = useState<string | null>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const roleDialogRef = useRef<HTMLDialogElement>(null);

  // Access management
  const [accessUserId, setAccessUserId] = useState<string | null>(null);
  const [linkedHosts, setLinkedHosts] = useState<LinkedHost[]>([]);
  const [linkedEvents, setLinkedEvents] = useState<LinkedEvent[]>([]);
  const accessDialogRef = useRef<HTMLDialogElement>(null);

  // Notes
  const [noteUserId, setNoteUserId] = useState<string | null>(null);
  const [noteUserName, setNoteUserName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const noteDialogRef = useRef<HTMLDialogElement>(null);

  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20", sort, sortDir });
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (hasNotesFilter) params.set("hasNotes", "true");
      const data = await authorizedGet<UsersResponse>(getToken, `/admin/users?${params}`);
      setUsers(data.items);
      setTotalItems(data.pagination.totalItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [getToken, page, search, sort, sortDir, roleFilter, hasNotesFilter]);

  useEffect(() => { void load(); }, [load]);

  function handleSort(key: SortKey) {
    if (sort === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir(key === "name" || key === "email" ? "asc" : "desc");
    }
    setPage(1);
  }

  function sortArrow(key: SortKey) {
    if (sort !== key) return "";
    return sortDir === "asc" ? "\u25B2" : "\u25BC";
  }

  // ── Role editing ──
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

  function toggleRole(role: string) {
    setEditRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  // ── Access management ──
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

  async function addHostToUser(userId: string, organizerId: string) {
    try {
      await authorizedPost(getToken, `/admin/users/${userId}/hosts`, { organizerId });
      const hosts = await authorizedGet<LinkedHost[]>(getToken, `/admin/users/${userId}/hosts`);
      setLinkedHosts(hosts);
      setAccessHostSearch("");
      setAccessHostResults([]);
      void load();
    } catch { /* ignore */ }
  }

  async function removeHostFromUser(userId: string, hostId: string) {
    try {
      await authorizedDelete(getToken, `/admin/users/${userId}/hosts/${hostId}`);
      setLinkedHosts((prev) => prev.filter((h) => h.organizer_id !== hostId));
      void load();
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

  async function toggleServiceAccount(userId: string, current: boolean) {
    try {
      await authorizedPatch(getToken, `/admin/users/${userId}/service-account`, { is_service_account: !current });
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update service account flag");
    }
  }

  // ── Notes ──
  function openNoteEdit(user: UserItem) {
    setNoteUserId(user.id);
    setNoteUserName(user.display_name ?? user.email ?? user.keycloak_sub.slice(0, 16));
    setNoteText(user.admin_notes ?? "");
    setTimeout(() => noteDialogRef.current?.showModal(), 0);
  }

  async function saveNote() {
    if (!noteUserId) return;
    setNoteSaving(true);
    try {
      await authorizedPatch(getToken, `/admin/users/${noteUserId}/notes`, { notes: noteText });
      noteDialogRef.current?.close();
      setNoteUserId(null);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setNoteSaving(false);
    }
  }

  return (
    <div>
      <h1 className="manage-page-title">{t("manage.admin.users.title")}</h1>

      {/* Filter bar */}
      <div className="manage-filter-bar">
        <div className="manage-filter-row">
          <input
            placeholder={t("manage.admin.users.searchPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ flex: 1, minWidth: 180 }}
          />
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          >
            <option value="">{t("manage.admin.users.allRoles")}</option>
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
          </select>
          <label className="filter-toggle">
            <input
              type="checkbox"
              checked={hasNotesFilter}
              onChange={(e) => { setHasNotesFilter(e.target.checked); setPage(1); }}
            />
            {t("manage.admin.users.hasNotes")}
          </label>
          {process.env.NEXT_PUBLIC_KEYCLOAK_ADMIN_URL && (
            <a href={process.env.NEXT_PUBLIC_KEYCLOAK_ADMIN_URL} target="_blank" rel="noopener noreferrer" className="ghost-btn" style={{ fontSize: "0.8rem", marginLeft: "auto" }}>
              {t("manage.admin.users.inviteUser")}
            </a>
          )}
        </div>
        {totalItems > 0 && (
          <span className="meta">{t("manage.pagination.showing", { start: (page - 1) * 20 + 1, end: (page - 1) * 20 + users.length, total: totalItems })}</span>
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
                  <th
                    className={`sortable${sort === "name" ? " sorted" : ""}`}
                    onClick={() => handleSort("name")}
                  >
                    {t("manage.admin.users.usernameEmail")}
                    <span className="sort-arrow">{sortArrow("name")}</span>
                  </th>
                  <th>{t("manage.common.roles")}</th>
                  <th
                    className={`sortable text-center${sort === "hosts" ? " sorted" : ""}`}
                    onClick={() => handleSort("hosts")}
                  >
                    {t("manage.admin.users.hosts")}
                    <span className="sort-arrow">{sortArrow("hosts")}</span>
                  </th>
                  <th
                    className={`sortable text-center${sort === "events" ? " sorted" : ""}`}
                    onClick={() => handleSort("events")}
                  >
                    {t("manage.admin.users.events")}
                    <span className="sort-arrow">{sortArrow("events")}</span>
                  </th>
                  <th>{t("manage.admin.users.notes")}</th>
                  <th
                    className={`sortable${sort === "created" ? " sorted" : ""}`}
                    onClick={() => handleSort("created")}
                  >
                    {t("manage.admin.users.joined")}
                    <span className="sort-arrow">{sortArrow("created")}</span>
                  </th>
                  <th className="text-right">{t("manage.admin.users.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div>
                        {user.display_name ?? user.keycloak_sub.slice(0, 16)}
                        {user.is_service_account && (
                          <span className="tag" style={{ fontSize: "0.65rem", marginLeft: 6, verticalAlign: "middle", background: "var(--accent-bg)", borderColor: "var(--accent)", color: "var(--accent)" }}>
                            {t("manage.admin.users.serviceAccount")}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                        {user.email ?? "\u2014"}
                      </div>
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
                    <td className="text-center">{user.host_count}</td>
                    <td className="text-center">{user.event_count}</td>
                    <td className="note-cell">
                      <div className="note-cell-inner" onClick={() => openNoteEdit(user)} title={user.admin_notes || t("manage.admin.users.notePlaceholder")}>
                        {user.admin_notes ? (
                          <span className="note-preview">{user.admin_notes}</span>
                        ) : (
                          <span className="note-btn-add">+</span>
                        )}
                      </div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="action-btns">
                        <button type="button" onClick={() => openRoleEdit(user)}>
                          {t("manage.common.roles")}
                        </button>
                        <button type="button" onClick={() => void openAccessManage(user.id)}>
                          {t("manage.common.access")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleServiceAccount(user.id, !!user.is_service_account)}
                          title={user.is_service_account ? t("manage.admin.users.removeServiceAccount") : t("manage.admin.users.markServiceAccount")}
                        >
                          {user.is_service_account ? t("manage.admin.users.removeServiceAccount") : t("manage.admin.users.markServiceAccount")}
                        </button>
                      </div>
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

      {/* Notes dialog */}
      <dialog ref={noteDialogRef} className="manage-dialog">
        <h3>{t("manage.admin.users.editNote")}</h3>
        <p className="meta" style={{ marginBottom: 8 }}>{noteUserName}</p>
        <textarea
          rows={4}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder={t("manage.admin.users.notePlaceholder")}
          style={{ width: "100%", fontSize: "0.9rem", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", resize: "vertical" }}
        />
        <div className="manage-dialog-actions">
          <button type="button" className="ghost-btn" onClick={() => noteDialogRef.current?.close()}>
            {t("manage.common.cancel")}
          </button>
          <button type="button" className="primary-btn" disabled={noteSaving} onClick={() => void saveNote()}>
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

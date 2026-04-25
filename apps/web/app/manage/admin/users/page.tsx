"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

import { ROLE_ADMIN, ROLE_EDITOR } from "@dr-events/shared";

import Link from "next/link";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { ConfirmDialog } from "../../../../components/manage/ConfirmDialog";
import { authorizedDelete, authorizedGet, authorizedPatch, authorizedPost } from "../../../../lib/manageApi";

type UserItem = {
  id: string;
  keycloak_sub: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
  last_login_at: string | null;
  host_count: number;
  event_count: number;
  save_count: number;
  rsvp_count: number;
  follow_count: number;
  comment_count: number;
  alert_count: number;
  suspended_at: string | null;
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

type SortKey = "created" | "name" | "email" | "hosts" | "events" | "last_login";

function fmtRelative(iso: string | null, never: string): string {
  if (!iso) return never;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminUsersPage() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(() => parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>(() => (searchParams.get("sort") as SortKey) || "created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => (searchParams.get("sortDir") as "asc" | "desc") || "desc");
  const [roleFilter, setRoleFilter] = useState(() => searchParams.get("role") ?? "");
  const [hasNotesFilter, setHasNotesFilter] = useState(() => searchParams.get("hasNotes") === "true");

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (roleFilter) params.set("role", roleFilter);
    if (hasNotesFilter) params.set("hasNotes", "true");
    if (sort !== "created") params.set("sort", sort);
    if (sortDir !== "desc") params.set("sortDir", sortDir);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url, { scroll: false });
  }, [search, roleFilter, hasNotesFilter, sort, sortDir, page, pathname, router]);

  // Info dialog
  const [infoUser, setInfoUser] = useState<UserItem | null>(null);
  const infoDialogRef = useRef<HTMLDialogElement>(null);

  // Edit dialog (tabbed)
  const [editUser, setEditUser] = useState<UserItem | null>(null);
  const [editTab, setEditTab] = useState<"roles" | "access" | "account">("roles");
  const editDialogRef = useRef<HTMLDialogElement>(null);

  // Edit → Roles tab
  const [editRoles, setEditRoles] = useState<string[]>([]);

  // Edit → Access tab
  const [linkedHosts, setLinkedHosts] = useState<LinkedHost[]>([]);
  const [linkedEvents, setLinkedEvents] = useState<LinkedEvent[]>([]);
  const [accessHostSearch, setAccessHostSearch] = useState("");
  const [accessHostResults, setAccessHostResults] = useState<Array<{ id: string; name: string }>>([]);
  const [accessEventSearch, setAccessEventSearch] = useState("");
  const [accessEventResults, setAccessEventResults] = useState<Array<{ id: string; title: string }>>([]);

  // Notes
  const [noteUserId, setNoteUserId] = useState<string | null>(null);
  const [noteUserName, setNoteUserName] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const noteDialogRef = useRef<HTMLDialogElement>(null);

  // Confirm dialogs
  const [confirmSuspend, setConfirmSuspend] = useState<{ userId: string; currently: boolean } | null>(null);
  const [confirmService, setConfirmService] = useState<{ userId: string; current: boolean } | null>(null);

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
    return sortDir === "asc" ? "▲" : "▼";
  }

  // ── Info dialog ──
  function openInfo(user: UserItem) {
    setInfoUser(user);
    setTimeout(() => infoDialogRef.current?.showModal(), 0);
  }

  // ── Edit dialog ──
  function openEdit(user: UserItem, tab: "roles" | "access" | "account" = "roles") {
    setEditUser(user);
    setEditTab(tab);
    setEditRoles(user.keycloak_roles ?? []);
    setLinkedHosts([]);
    setLinkedEvents([]);
    setAccessHostSearch("");
    setAccessHostResults([]);
    setAccessEventSearch("");
    setAccessEventResults([]);
    setTimeout(() => editDialogRef.current?.showModal(), 0);
    if (tab === "access") {
      void loadAccessData(user.id);
    }
  }

  function switchTab(tab: "roles" | "access" | "account") {
    setEditTab(tab);
    if (tab === "access" && editUser && linkedHosts.length === 0 && linkedEvents.length === 0) {
      void loadAccessData(editUser.id);
    }
  }

  async function loadAccessData(userId: string) {
    try {
      const [hosts, events] = await Promise.all([
        authorizedGet<LinkedHost[]>(getToken, `/admin/users/${userId}/hosts`),
        authorizedGet<LinkedEvent[]>(getToken, `/admin/users/${userId}/events`),
      ]);
      setLinkedHosts(hosts);
      setLinkedEvents(events);
    } catch { /* ignore */ }
  }

  function closeEdit() {
    editDialogRef.current?.close();
    setEditUser(null);
  }

  // ── Roles tab ──
  async function saveRoles() {
    if (!editUser) return;
    const currentRoles = editUser.keycloak_roles ?? [];
    const toAdd = editRoles.filter((r) => !currentRoles.includes(r));
    const toRemove = currentRoles.filter((r) => !editRoles.includes(r));
    try {
      await authorizedPatch(getToken, `/admin/users/${editUser.id}/roles`, {
        add: toAdd.length ? toAdd : undefined,
        remove: toRemove.length ? toRemove : undefined,
      });
      closeEdit();
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update roles");
    }
  }

  // ── Access tab ──
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

  // ── Account tab ──
  async function doToggleServiceAccount(userId: string, current: boolean) {
    try {
      await authorizedPatch(getToken, `/admin/users/${userId}/service-account`, { is_service_account: !current });
      setEditUser((u) => u ? { ...u, is_service_account: !current } : u);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, is_service_account: !current } : u));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update service account flag");
    }
  }

  async function doToggleSuspend(userId: string, currentlySuspended: boolean) {
    try {
      await authorizedPatch(getToken, `/admin/users/${userId}/suspend`, { suspended: !currentlySuspended });
      const newSuspendedAt = currentlySuspended ? null : new Date().toISOString();
      setEditUser((u) => u ? { ...u, suspended_at: newSuspendedAt } : u);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, suspended_at: newSuspendedAt } : u));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update suspension");
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

  const neverLabel = t("manage.admin.users.neverLoggedIn");

  return (
    <div>
      {/* Filter bar */}
      <div className="manage-filter-bar">
        <div className="manage-filter-row">
          <input
            placeholder={t("manage.admin.users.searchPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ flex: 1, minWidth: 180 }}
          />
          {process.env.NEXT_PUBLIC_KEYCLOAK_ADMIN_URL && (
            <a href={process.env.NEXT_PUBLIC_KEYCLOAK_ADMIN_URL} target="_blank" rel="noopener noreferrer" className="ghost-btn" style={{ fontSize: "0.8rem", marginLeft: "auto" }}>
              {t("manage.admin.users.inviteUser")}
            </a>
          )}
        </div>
        <div className="manage-filter-row">
          <div className="manage-status-pills">
            {([
              { value: "", label: t("manage.admin.users.allRoles") },
              { value: "admin", label: "Admin" },
              { value: "editor", label: "Editor" },
              { value: "suspended", label: t("manage.admin.users.suspended") },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                data-active={roleFilter === opt.value}
                onClick={() => { setRoleFilter(opt.value); setPage(1); }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="filter-pill"
            data-active={hasNotesFilter}
            onClick={() => { setHasNotesFilter((v) => !v); setPage(1); }}
          >
            {t("manage.admin.users.hasNotes")}
          </button>
          {totalItems > 0 && (
            <span className="meta" style={{ marginLeft: "auto" }}>
              {t("manage.pagination.showing", { start: (page - 1) * 20 + 1, end: (page - 1) * 20 + users.length, total: totalItems })}
            </span>
          )}
        </div>
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
                  <th
                    className={`sortable${sort === "last_login" ? " sorted" : ""}`}
                    onClick={() => handleSort("last_login")}
                  >
                    {t("manage.admin.users.lastLogin")}
                    <span className="sort-arrow">{sortArrow("last_login")}</span>
                  </th>
                  <th className="text-right">{t("manage.admin.users.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div>
                        <Link href={`/manage/admin/users/${user.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                          {user.display_name ?? user.keycloak_sub.slice(0, 16)}
                        </Link>
                        {user.is_service_account && (
                          <span className="tag" style={{ fontSize: "0.65rem", marginLeft: 6, verticalAlign: "middle", background: "var(--accent-bg)", borderColor: "var(--accent)", color: "var(--accent)" }}>
                            {t("manage.admin.users.serviceAccount")}
                          </span>
                        )}
                        {user.suspended_at && (
                          <span className="tag" style={{ fontSize: "0.65rem", marginLeft: 6, verticalAlign: "middle", background: "#fef2f2", borderColor: "#dc2626", color: "#dc2626" }}>
                            {t("manage.admin.users.suspended")}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                        {user.email ?? "—"}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {(user.keycloak_roles ?? []).filter((r) => r === "admin" || r === "editor").map((r) => (
                          <span key={r} className={`tag tag--${r}`} style={{ fontSize: "0.7rem" }}>
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
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className={user.last_login_at ? undefined : "meta"}>
                        {fmtRelative(user.last_login_at, neverLabel)}
                      </span>
                    </td>
                    <td>
                      <div className="action-btns">
                        <button type="button" className="ghost-btn" onClick={() => openInfo(user)}>
                          {t("manage.admin.users.info")}
                        </button>
                        <button type="button" className="secondary-btn" onClick={() => openEdit(user)}>
                          {t("manage.admin.users.edit")}
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

      {/* ── Info dialog ── */}
      <dialog ref={infoDialogRef} className="manage-dialog" style={{ maxWidth: 460, width: "100%" }}>
        {infoUser && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "1rem" }}>
                  {infoUser.display_name ?? infoUser.keycloak_sub.slice(0, 16)}
                </div>
                <div className="meta" style={{ fontSize: "0.8rem" }}>{infoUser.email ?? "—"}</div>
              </div>
              <button type="button" className="ghost-btn" style={{ fontSize: "0.8rem", padding: "4px 8px" }} onClick={() => infoDialogRef.current?.close()}>
                ✕
              </button>
            </div>

            {/* Engagement stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
              {([
                { label: t("manage.admin.users.saves"), value: infoUser.save_count },
                { label: "RSVPs", value: infoUser.rsvp_count },
                { label: t("manage.admin.users.follows"), value: infoUser.follow_count },
                { label: t("manage.admin.users.commentsCol"), value: infoUser.comment_count },
                { label: t("manage.admin.users.alerts"), value: infoUser.alert_count },
              ]).map(({ label, value }) => (
                <div key={label} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{value}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* User details */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: "0.875rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="meta">{t("manage.common.roles")}</span>
                <span>
                  {(infoUser.keycloak_roles ?? []).filter((r) => r === "admin" || r === "editor").length > 0
                    ? (infoUser.keycloak_roles ?? []).filter((r) => r === "admin" || r === "editor").map((r) => (
                        <span key={r} className={`tag tag--${r}`} style={{ fontSize: "0.7rem", marginLeft: 4 }}>{r}</span>
                      ))
                    : <span className="meta">{"—"}</span>
                  }
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="meta">{t("manage.admin.users.joined")}</span>
                <span>{new Date(infoUser.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="meta">{t("manage.admin.users.lastLogin")}</span>
                <span className={infoUser.last_login_at ? undefined : "meta"}>
                  {fmtRelative(infoUser.last_login_at, neverLabel)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="meta">Status</span>
                <span>
                  {infoUser.suspended_at
                    ? <span style={{ color: "#dc2626" }}>Suspended {new Date(infoUser.suspended_at).toLocaleDateString()}</span>
                    : <span style={{ color: "var(--success, #16a34a)" }}>Active</span>
                  }
                </span>
              </div>
              {infoUser.is_service_account && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="meta">{t("manage.admin.users.serviceAccount")}</span>
                  <span className="tag" style={{ fontSize: "0.7rem", background: "var(--accent-bg)", borderColor: "var(--accent)", color: "var(--accent)" }}>Yes</span>
                </div>
              )}
            </div>

            <div className="manage-dialog-actions" style={{ marginTop: 16, justifyContent: "space-between" }}>
              <Link href={`/manage/admin/users/${infoUser.id}`} className="ghost-btn" style={{ fontSize: "0.85rem" }}>
                {t("manage.admin.users.viewFullProfile")} →
              </Link>
              <button type="button" className="secondary-btn" onClick={() => infoDialogRef.current?.close()}>
                {t("manage.common.close")}
              </button>
            </div>
          </>
        )}
      </dialog>

      {/* ── Edit dialog (tabbed) ── */}
      <dialog ref={editDialogRef} className="manage-dialog manage-dialog--wide" style={{ maxWidth: 520, width: "100%" }}>
        {editUser && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{t("manage.admin.users.editUser")}</div>
                <div className="meta" style={{ fontSize: "0.8rem" }}>{editUser.display_name ?? editUser.email ?? editUser.keycloak_sub.slice(0, 16)}</div>
              </div>
              <button type="button" className="ghost-btn" style={{ fontSize: "0.8rem", padding: "4px 8px" }} onClick={closeEdit}>
                ✕
              </button>
            </div>

            {/* Tab bar */}
            <div className="manage-status-pills" style={{ marginBottom: 16 }}>
              {(["roles", "access", "account"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  data-active={editTab === tab}
                  onClick={() => switchTab(tab)}
                >
                  {tab === "roles" ? t("manage.admin.users.tabRoles")
                    : tab === "access" ? t("manage.admin.users.tabAccess")
                    : t("manage.admin.users.tabAccount")}
                </button>
              ))}
            </div>

            {/* Roles tab */}
            {editTab === "roles" && (
              <div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                  {[ROLE_EDITOR, ROLE_ADMIN].map((role) => (
                    <label key={role} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: editRoles.includes(role) ? "var(--accent-bg)" : "var(--surface)" }}>
                      <input
                        type="checkbox"
                        checked={editRoles.includes(role)}
                        onChange={() => setEditRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role])}
                      />
                      <span style={{ fontWeight: 500 }}>{role}</span>
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="ghost-btn" onClick={closeEdit}>{t("manage.common.cancel")}</button>
                  <button type="button" className="primary-btn" onClick={() => void saveRoles()}>{t("manage.common.save")}</button>
                </div>
              </div>
            )}

            {/* Access tab */}
            {editTab === "access" && (
              <div>
                <h4 style={{ margin: "0 0 8px", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>{t("manage.admin.users.linkedHosts")}</h4>
                {linkedHosts.length === 0 ? (
                  <p className="meta" style={{ fontSize: "0.85rem", marginBottom: 8 }}>{t("manage.admin.users.noLinkedHosts")}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                    {linkedHosts.map((h) => (
                      <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontSize: "0.9rem" }}>{h.organizer_name}</span>
                        <button type="button" className="ghost-btn" style={{ fontSize: "0.75rem", color: "var(--danger, #c53030)" }} onClick={() => void removeHostFromUser(editUser.id, h.organizer_id)}>
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
                        <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => void addHostToUser(editUser.id, h.id)}>
                          <span style={{ fontSize: "0.85rem" }}>{h.name}</span>
                          <span className="meta" style={{ fontSize: "0.75rem" }}>+ {t("manage.common.add")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <h4 style={{ margin: "0 0 8px", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>{t("manage.admin.users.linkedEvents")}</h4>
                {linkedEvents.length === 0 ? (
                  <p className="meta" style={{ fontSize: "0.85rem", marginBottom: 8 }}>{t("manage.admin.users.noLinkedEvents")}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                    {linkedEvents.map((ev) => (
                      <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontSize: "0.9rem" }}>{ev.title} <span className="meta">({ev.status})</span></span>
                        <button type="button" className="ghost-btn" style={{ fontSize: "0.75rem", color: "var(--danger, #c53030)" }} onClick={() => void removeEventFromUser(editUser.id, ev.id)}>
                          {t("manage.common.remove")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <input
                    placeholder={t("manage.admin.users.searchEventsToAdd")}
                    value={accessEventSearch}
                    onChange={(e) => { setAccessEventSearch(e.target.value); void searchEventsForAccess(e.target.value); }}
                    style={{ width: "100%", fontSize: "0.85rem" }}
                  />
                  {accessEventResults.length > 0 && (
                    <div style={{ border: "1px solid var(--border)", borderRadius: 4, maxHeight: 150, overflow: "auto", marginTop: 4 }}>
                      {accessEventResults.map((ev) => (
                        <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => void addEventToUser(editUser.id, ev.id)}>
                          <span style={{ fontSize: "0.85rem" }}>{ev.title}</span>
                          <span className="meta" style={{ fontSize: "0.75rem" }}>+ {t("manage.common.add")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="manage-dialog-actions">
                  <button type="button" className="ghost-btn" onClick={closeEdit}>{t("manage.common.close")}</button>
                </div>
              </div>
            )}

            {/* Account tab */}
            {editTab === "account" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Service account */}
                <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{t("manage.admin.users.serviceAccount")}</div>
                    <div className="meta" style={{ fontSize: "0.8rem" }}>
                      {editUser.is_service_account ? "Enabled" : "Disabled"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={editUser.is_service_account ? "secondary-btn" : "ghost-btn"}
                    style={{ fontSize: "0.8rem" }}
                    onClick={() => setConfirmService({ userId: editUser.id, current: !!editUser.is_service_account })}
                  >
                    {editUser.is_service_account ? t("manage.admin.users.removeServiceAccount") : t("manage.admin.users.markServiceAccount")}
                  </button>
                </div>

                {/* Suspend */}
                <div style={{ padding: 14, border: `1px solid ${editUser.suspended_at ? "#dc2626" : "var(--border)"}`, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>{t("manage.admin.users.suspend")}</div>
                    <div className="meta" style={{ fontSize: "0.8rem" }}>
                      {editUser.suspended_at
                        ? `Suspended since ${new Date(editUser.suspended_at).toLocaleDateString()}`
                        : "Account is active"
                      }
                    </div>
                  </div>
                  <button
                    type="button"
                    className={editUser.suspended_at ? "secondary-btn" : "danger-btn"}
                    style={{ fontSize: "0.8rem" }}
                    onClick={() => setConfirmSuspend({ userId: editUser.id, currently: !!editUser.suspended_at })}
                  >
                    {editUser.suspended_at ? t("manage.admin.users.unsuspend") : t("manage.admin.users.suspend")}
                  </button>
                </div>

                <div className="manage-dialog-actions">
                  <button type="button" className="ghost-btn" onClick={closeEdit}>{t("manage.common.close")}</button>
                </div>
              </div>
            )}
          </>
        )}
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

      {/* Confirm: suspend */}
      <ConfirmDialog
        open={!!confirmSuspend}
        title={confirmSuspend?.currently ? t("manage.admin.users.unsuspend") : t("manage.admin.users.suspend")}
        message={confirmSuspend?.currently
          ? "This will restore access for this user."
          : t("manage.admin.users.confirmSuspend")}
        confirmLabel={confirmSuspend?.currently ? t("manage.admin.users.unsuspend") : t("manage.admin.users.suspend")}
        variant={confirmSuspend?.currently ? "info" : "danger"}
        onConfirm={() => {
          if (confirmSuspend) { void doToggleSuspend(confirmSuspend.userId, confirmSuspend.currently); }
          setConfirmSuspend(null);
        }}
        onCancel={() => setConfirmSuspend(null)}
      />

      {/* Confirm: service account */}
      <ConfirmDialog
        open={!!confirmService}
        title={t("manage.admin.users.serviceAccount")}
        message={t("manage.admin.users.confirmServiceAccount")}
        confirmLabel={confirmService?.current ? t("manage.admin.users.removeServiceAccount") : t("manage.admin.users.markServiceAccount")}
        variant="warning"
        onConfirm={() => {
          if (confirmService) { void doToggleServiceAccount(confirmService.userId, confirmService.current); }
          setConfirmService(null);
        }}
        onCancel={() => setConfirmService(null)}
      />
    </div>
  );
}

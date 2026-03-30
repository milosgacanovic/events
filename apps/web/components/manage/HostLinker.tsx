"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useI18n } from "../i18n/I18nProvider";
import { authorizedGet } from "../../lib/manageApi";
import { apiBase } from "../../lib/api";

type OrganizerOption = {
  id: string;
  name: string;
  status?: string;
  first_role_id?: string | null;
  image_url?: string | null;
  avatar_path?: string | null;
};

type AddedHostInfo = { name: string; avatarUrl: string | null; status?: string };

type RoleOption = {
  id: string;
  key: string;
  label: string;
};

export type EventOrganizerRoleDraft = {
  organizerId: string;
  roleId: string;
  displayOrder: number;
};

export function HostLinker({
  getToken,
  roleOptions,
  roles,
  onChange,
  organizerNamesById,
  organizerAvatarsById,
  organizerStatusesById,
  roleLabelsById,
  isAdmin = false,
  onSaveThenCreateHost,
}: {
  getToken: () => Promise<string | null>;
  roleOptions: RoleOption[];
  roles: EventOrganizerRoleDraft[];
  onChange: (roles: EventOrganizerRoleDraft[]) => void;
  organizerNamesById: Map<string, string>;
  organizerAvatarsById?: Map<string, string | null>;
  organizerStatusesById?: Map<string, string>;
  roleLabelsById: Map<string, string>;
  isAdmin?: boolean;
  onSaveThenCreateHost?: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<OrganizerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasNoHosts, setHasNoHosts] = useState<boolean | null>(null); // null = not checked yet
  const [addedHosts, setAddedHosts] = useState<Map<string, AddedHostInfo>>(new Map());
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);
  const focusSearchDone = useRef(false);

  const defaultRoleId = useMemo(() => roleOptions[0]?.id ?? "", [roleOptions]);

  const buildSearchUrl = useCallback((q: string, pageSize: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("pageSize", String(pageSize));
    if (!isAdmin) params.set("managedBy", "me");
    return `/admin/organizers?${params}`;
  }, [isAdmin]);

  const doSearch = useCallback(async (q: string, pageSize: number) => {
    setSearching(true);
    try {
      const data = await authorizedGet<{ items: OrganizerOption[] }>(
        getToken,
        buildSearchUrl(q, pageSize),
      );
      setResults(data.items);
      if (!q && !isAdmin && data.items.length === 0) {
        setHasNoHosts(true);
      } else {
        setHasNoHosts(false);
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [getToken, buildSearchUrl, isAdmin]);

  // Check on mount whether user has any hosts (non-admin only)
  useEffect(() => {
    if (!isAdmin) {
      void doSearch("", 5);
    } else {
      setHasNoHosts(false);
    }
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search on typing
  useEffect(() => {
    if (!query.trim()) {
      if (!focusSearchDone.current) setResults([]);
      return;
    }
    focusSearchDone.current = false;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void doSearch(query.trim(), 20);
    }, 250);
    return () => clearTimeout(searchTimer.current);
  }, [query, doSearch]);

  const getHost = useCallback((id: string) => {
    const added = addedHosts.get(id);
    const preloadedAvatar = organizerAvatarsById?.get(id) ?? null;
    const hostStatus = added?.status ?? organizerStatusesById?.get(id) ?? "published";
    return {
      name: organizerNamesById.get(id) ?? added?.name ?? id,
      avatarUrl: added?.avatarUrl ?? preloadedAvatar,
      status: hostStatus,
    };
  }, [organizerNamesById, organizerAvatarsById, organizerStatusesById, addedHosts]);

  const addHost = useCallback((org: OrganizerOption) => {
    const roleId = org.first_role_id || defaultRoleId;
    if (!roleId) return;
    const duplicate = roles.some((r) => r.organizerId === org.id && r.roleId === roleId);
    if (duplicate) return;
    const avatarUrl = org.image_url || org.avatar_path || null;
    setAddedHosts((prev) => new Map(prev).set(org.id, { name: org.name, avatarUrl, status: org.status }));
    onChange([
      ...roles,
      { organizerId: org.id, roleId, displayOrder: roles.length },
    ]);
    setQuery("");
    setOpen(false);
    setResults([]);
    focusSearchDone.current = false;
  }, [roles, onChange, defaultRoleId]);

  function removeRole(index: number) {
    const next = roles.filter((_, i) => i !== index)
      .map((r, i) => ({ ...r, displayOrder: i }));
    onChange(next);
  }

  function changeRole(index: number, newRoleId: string) {
    const next = roles.map((r, i) => i === index ? { ...r, roleId: newRoleId } : r);
    onChange(next);
  }

  function handleBlur() {
    blurTimer.current = setTimeout(() => {
      setOpen(false);
      focusSearchDone.current = false;
    }, 200);
  }

  function handleFocus() {
    clearTimeout(blurTimer.current);
    setOpen(true);
    if (!query.trim() && !focusSearchDone.current) {
      focusSearchDone.current = true;
      void doSearch("", 5);
    }
  }

  const showDropdown = open && (query.trim() || focusSearchDone.current);

  const dropdownStyle = {
    position: "absolute" as const,
    top: "100%",
    left: 0,
    right: 0,
    background: "var(--bg, #fff)",
    border: "1px solid var(--border, #e0e0e0)",
    borderRadius: 6,
    zIndex: 50,
    marginTop: 2,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  };

  // Non-admin with no hosts: show banner instead of search input
  if (hasNoHosts && !isAdmin && roles.length === 0) {
    return (
      <div className="manage-host-linker-banner">
        <div>
          <p style={{ margin: "0 0 4px" }}>{t("manage.hostLinker.noHostsBanner")}</p>
          <p className="meta" style={{ margin: 0 }}>{t("manage.hostLinker.noHostsBannerHint")}</p>
        </div>
        {onSaveThenCreateHost && (
          <button type="button" className="secondary-btn" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={onSaveThenCreateHost}>
            {t("manage.hostLinker.createHost")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Search input */}
      <div style={{ position: "relative", marginBottom: 8 }}>
        <input
          ref={inputRef}
          placeholder={t("manage.hostLinker.searchPlaceholder")}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); focusSearchDone.current = false; }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={{ width: "100%" }}
          autoComplete="off"
        />
        {showDropdown && searching && (
          <div style={{ ...dropdownStyle, padding: "8px 12px", color: "var(--ink-muted, #999)", fontSize: "0.9rem" }}>
            {t("manage.hostLinker.searching")}
          </div>
        )}
        {showDropdown && !searching && results.length > 0 && (
          <div style={{ ...dropdownStyle, maxHeight: 200, overflowY: "auto" as const }}>
            {results.map((o) => {
              const avatarSrc = o.image_url || o.avatar_path
                ? ((o.image_url || o.avatar_path)!.startsWith("http") ? (o.image_url || o.avatar_path)! : apiBase.replace("/api", "") + (o.image_url || o.avatar_path)!)
                : null;
              const initials = o.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
              return (
                <button
                  key={o.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); addHost(o); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 12px",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    color: "var(--ink, #333)",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover, rgba(0,0,0,0.05))"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: avatarSrc ? undefined : "var(--surface-skeleton, #e0e0e0)",
                    fontSize: "0.7rem", fontWeight: 600, overflow: "hidden",
                  }}>
                    {avatarSrc ? (
                      <img src={avatarSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      initials
                    )}
                  </span>
                  {o.name}
                  {o.status && o.status !== "published" && (
                    <span className={`manage-status-pill manage-status-pill--${o.status}`} style={{ fontSize: "0.7rem", padding: "1px 6px", marginLeft: 4 }}>
                      {t(`common.status.${o.status}`)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {showDropdown && !searching && results.length === 0 && (
          <div style={{ ...dropdownStyle, padding: "8px 12px", color: "var(--ink-muted, #999)", fontSize: "0.9rem" }}>
            {t("manage.hostLinker.noResults")}
          </div>
        )}
      </div>

      {/* Linked hosts list */}
      {roles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          {roles.map((r, i) => {
            const host = getHost(r.organizerId);
            const initials = host.name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
            const resolvedAvatar = host.avatarUrl
              ? (host.avatarUrl.startsWith("http") ? host.avatarUrl : apiBase.replace("/api", "") + host.avatarUrl)
              : null;
            return (
              <div key={`${r.organizerId}-${r.roleId}-${i}`} className="manage-host-chip">
                <div className="manage-host-chip-avatar">
                  {resolvedAvatar ? (
                    <img src={resolvedAvatar} alt="" />
                  ) : (
                    <span>{initials}</span>
                  )}
                </div>
                <span className="manage-host-chip-name">{host.name}</span>
                {host.status && host.status !== "published" && (
                  <span className={`manage-status-pill manage-status-pill--${host.status}`} style={{ fontSize: "0.7rem", padding: "1px 6px" }}>
                    {t(`common.status.${host.status}`)}
                  </span>
                )}
                <div className="manage-host-chip-right">
                  <select
                    value={r.roleId}
                    onChange={(e) => changeRole(i, e.target.value)}
                    className="manage-host-chip-role"
                  >
                    {roleOptions.map((ro) => (
                      <option key={ro.id} value={ro.id}>{ro.label}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeRole(i)} className="manage-host-chip-remove">×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useMemo, useRef, useState } from "react";

type OrganizerOption = {
  id: string;
  name: string;
};

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
  organizerOptions,
  roleOptions,
  roles,
  onChange,
  organizerNamesById,
  roleLabelsById,
}: {
  organizerOptions: OrganizerOption[];
  roleOptions: RoleOption[];
  roles: EventOrganizerRoleDraft[];
  onChange: (roles: EventOrganizerRoleDraft[]) => void;
  organizerNamesById: Map<string, string>;
  roleLabelsById: Map<string, string>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultRoleId = useMemo(() => roleOptions[0]?.id ?? "", [roleOptions]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return organizerOptions.filter((o) =>
      (!q || o.name.toLowerCase().includes(q)),
    );
  }, [organizerOptions, query]);

  const addHost = useCallback((orgId: string) => {
    const roleId = selectedRoleId || defaultRoleId;
    if (!roleId) return;
    const duplicate = roles.some((r) => r.organizerId === orgId && r.roleId === roleId);
    if (duplicate) return;
    onChange([
      ...roles,
      { organizerId: orgId, roleId, displayOrder: roles.length },
    ]);
    setQuery("");
    setOpen(false);
  }, [roles, onChange, selectedRoleId, defaultRoleId]);

  function removeRole(index: number) {
    const next = roles.filter((_, i) => i !== index)
      .map((r, i) => ({ ...r, displayOrder: i }));
    onChange(next);
  }

  function handleBlur() {
    blurTimer.current = setTimeout(() => setOpen(false), 200);
  }

  function handleFocus() {
    clearTimeout(blurTimer.current);
    setOpen(true);
  }

  return (
    <div>
      {/* Combobox */}
      <div style={{ position: "relative", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <input
              ref={inputRef}
              placeholder="Search hosts..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={handleFocus}
              onBlur={handleBlur}
              style={{ width: "100%" }}
              autoComplete="off"
            />
            {open && organizerOptions.length === 0 && (
              <span className="meta">Loading hosts...</span>
            )}
            {open && filtered.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  maxHeight: 200,
                  overflowY: "auto",
                  background: "var(--bg, #fff)",
                  border: "1px solid var(--border, #e0e0e0)",
                  borderRadius: 6,
                  zIndex: 50,
                  marginTop: 2,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
              >
                {filtered.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); addHost(o.id); }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                      color: "var(--ink, #333)",
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "var(--hover, rgba(0,0,0,0.05))"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "none"; }}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            )}
            {open && organizerOptions.length > 0 && filtered.length === 0 && query.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  padding: "8px 12px",
                  background: "var(--bg, #fff)",
                  border: "1px solid var(--border, #e0e0e0)",
                  borderRadius: 6,
                  zIndex: 50,
                  marginTop: 2,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  color: "var(--ink-muted, #999)",
                  fontSize: "0.9rem",
                }}
              >
                No hosts matching &ldquo;{query}&rdquo;
              </div>
            )}
          </div>
          <select
            value={selectedRoleId || defaultRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            style={{ minWidth: 120 }}
          >
            {roleOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Linked hosts list */}
      {roles.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {roles.map((r, i) => (
            <div key={`${r.organizerId}-${r.roleId}`} className="kv" style={{ gap: 8, marginBottom: 4 }}>
              <span className="meta">
                {organizerNamesById.get(r.organizerId) ?? r.organizerId}
                {" — "}
                {roleLabelsById.get(r.roleId) ?? r.roleId}
              </span>
              <button type="button" className="ghost-btn" onClick={() => removeRole(i)}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

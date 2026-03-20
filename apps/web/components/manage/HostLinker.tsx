"use client";

import { useMemo, useState } from "react";

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
  const [selectedOrganizerId, setSelectedOrganizerId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");

  const defaultRoleId = useMemo(() => roleOptions[0]?.id ?? "", [roleOptions]);

  function addRole() {
    const orgId = selectedOrganizerId;
    const roleId = selectedRoleId || defaultRoleId;
    if (!orgId || !roleId) return;

    const duplicate = roles.some((r) => r.organizerId === orgId && r.roleId === roleId);
    if (duplicate) return;

    onChange([
      ...roles,
      { organizerId: orgId, roleId, displayOrder: roles.length },
    ]);
    setSelectedOrganizerId("");
  }

  function removeRole(index: number) {
    const next = roles.filter((_, i) => i !== index)
      .map((r, i) => ({ ...r, displayOrder: i }));
    onChange(next);
  }

  return (
    <div>
      <div className="kv" style={{ gap: 8, flexWrap: "wrap" }}>
        <select value={selectedOrganizerId} onChange={(e) => setSelectedOrganizerId(e.target.value)}>
          <option value="">Select host...</option>
          {organizerOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <select value={selectedRoleId || defaultRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}>
          {roleOptions.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        <button type="button" className="secondary-btn" onClick={addRole}>Add</button>
      </div>
      {roles.length > 0 && (
        <div style={{ marginTop: 8 }}>
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

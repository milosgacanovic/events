"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { AssignToUserModal } from "../../../../components/manage/AssignToUserModal";
import { StatusBadge } from "../../../../components/manage/StatusBadge";
import { authorizedGet } from "../../../../lib/manageApi";
import { apiBase } from "../../../../lib/api";

type TaxonomyResponse = {
  practices: {
    categories: Array<{ id: string; key: string; label: string }>;
  };
  organizerRoles: Array<{ id: string; key: string; label: string }>;
};

type HostItem = {
  id: string;
  slug: string;
  name: string;
  status: string;
  updated_at: string;
  managed_by_names: string | null;
};

type HostsResponse = {
  items: HostItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

export default function AdminAllHostsPage() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const [hosts, setHosts] = useState<HostItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [practiceFilter, setPracticeFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [assignHostId, setAssignHostId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/meta/taxonomies`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: TaxonomyResponse) => setTaxonomy(d))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20", showArchived: "true" });
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);
      if (practiceFilter) params.set("practiceCategoryId", practiceFilter);
      if (roleFilter) params.set("profileRoleId", roleFilter);
      if (countryFilter) params.set("countryCode", countryFilter);
      const data = await authorizedGet<HostsResponse>(getToken, `/admin/organizers?${params}`);
      setHosts(data.items);
      setTotalItems(data.pagination.totalItems);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [getToken, page, search, statusFilter, practiceFilter, roleFilter, countryFilter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <h1 className="manage-page-title">{t("manage.admin.hosts.title")}</h1>

      <div className="manage-filter-bar">
        <input placeholder="Search hosts..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        {taxonomy?.practices.categories && taxonomy.practices.categories.length > 0 && (
          <select value={practiceFilter} onChange={(e) => { setPracticeFilter(e.target.value); setPage(1); }}>
            <option value="">All practices</option>
            {taxonomy.practices.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        )}
        {taxonomy?.organizerRoles && taxonomy.organizerRoles.length > 0 && (
          <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
            <option value="">All roles</option>
            {taxonomy.organizerRoles.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        )}
        <input
          placeholder="Country code..."
          value={countryFilter}
          onChange={(e) => { setCountryFilter(e.target.value); setPage(1); }}
          style={{ maxWidth: 120 }}
        />
        <span className="meta">{totalItems} host{totalItems !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="manage-loading">Loading...</div>
      ) : (
        <>
          <div className="manage-cards-grid">
            {hosts.map((host) => (
              <div key={host.id} className="manage-event-card">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <Link href={`/manage/hosts/${host.id}`} style={{ fontWeight: 600, textDecoration: "none", color: "var(--ink)" }}>
                    {host.name}
                  </Link>
                  <StatusBadge status={host.status} />
                </div>
                {host.managed_by_names && (
                  <div className="meta" style={{ fontSize: "0.8rem", marginTop: 2 }}>
                    Managed by: {host.managed_by_names}
                  </div>
                )}
                <div className="manage-event-card-actions">
                  <Link href={`/manage/hosts/${host.id}`} className="secondary-btn" style={{ fontSize: "0.85rem" }}>Edit</Link>
                  <Link href={`/hosts/${host.slug}`} className="ghost-btn" style={{ fontSize: "0.85rem" }}>View</Link>
                  <button type="button" className="ghost-btn" style={{ fontSize: "0.85rem" }} onClick={() => setAssignHostId(host.id)}>
                    Assign
                  </button>
                </div>
              </div>
            ))}
          </div>
          {(page > 1 || hosts.length === 20) && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {page > 1 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>Previous</button>}
              {hosts.length === 20 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>Next</button>}
            </div>
          )}
        </>
      )}
      {assignHostId && (
        <AssignToUserModal
          getToken={getToken}
          entityType="hosts"
          entityId={assignHostId}
          onAssigned={() => void load()}
          onClose={() => setAssignHostId(null)}
        />
      )}
    </div>
  );
}

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
  city: string | null;
  country_code: string | null;
  practice_labels: string | null;
  role_labels: string | null;
  event_count: string | null;
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
  const [error, setError] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [assignHostId, setAssignHostId] = useState<string | null>(null);

  const pageSize = 20;

  useEffect(() => {
    fetch(`${apiBase}/meta/taxonomies`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: TaxonomyResponse) => setTaxonomy(d))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), showArchived: "true" });
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);
      if (practiceFilter) params.set("practiceCategoryId", practiceFilter);
      if (roleFilter) params.set("profileRoleId", roleFilter);
      if (countryFilter) params.set("countryCode", countryFilter);
      const data = await authorizedGet<HostsResponse>(getToken, `/admin/organizers?${params}`);
      setHosts(data.items);
      setTotalItems(data.pagination.totalItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load hosts");
    } finally {
      setLoading(false);
    }
  }, [getToken, page, search, statusFilter, practiceFilter, roleFilter, countryFilter]);

  useEffect(() => { void load(); }, [load]);

  const pageStart = (page - 1) * pageSize + 1;
  const pageEnd = (page - 1) * pageSize + hosts.length;

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
        {totalItems > 0 && (
          <span className="meta">Showing {pageStart}–{pageEnd} of {totalItems}</span>
        )}
      </div>

      {error && (
        <div className="manage-empty">
          <p>{error}</p>
          <button type="button" className="secondary-btn" onClick={() => void load()} style={{ marginTop: 8 }}>Retry</button>
        </div>
      )}

      {!error && (
        <>
          <div className={`manage-cards-grid${loading ? " manage-list-loading" : ""}`}>
            {hosts.map((host) => (
              <div key={host.id} className="manage-event-card">
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <Link href={`/manage/hosts/${host.id}`} style={{ fontWeight: 600, textDecoration: "none", color: "var(--ink)" }}>
                    {host.name}
                  </Link>
                  <StatusBadge status={host.status} />
                </div>
                <div className="meta" style={{ fontSize: "0.82rem", marginTop: 2 }}>
                  {[host.city, host.country_code].filter(Boolean).join(", ")}
                </div>
                {host.practice_labels && (
                  <div className="meta" style={{ fontSize: "0.8rem" }}>
                    {t("manage.admin.hosts.practice")}: {host.practice_labels}
                  </div>
                )}
                {host.role_labels && (
                  <div className="meta" style={{ fontSize: "0.8rem" }}>
                    {t("manage.admin.hosts.role")}: {host.role_labels}
                  </div>
                )}
                {host.event_count && host.event_count !== "0" && (
                  <div className="meta" style={{ fontSize: "0.8rem" }}>
                    {t("manage.admin.hosts.eventCount")}: {host.event_count}
                  </div>
                )}
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
          {loading && hosts.length === 0 && <div className="manage-loading">Loading...</div>}
          {(page > 1 || hosts.length === pageSize) && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {page > 1 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>Previous</button>}
              {hosts.length === pageSize && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>Next</button>}
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

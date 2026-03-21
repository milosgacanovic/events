"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ROLE_ADMIN } from "@dr-events/shared";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { StatusBadge } from "../../../components/manage/StatusBadge";
import { authorizedGet } from "../../../lib/manageApi";

type HostItem = {
  id: string;
  slug: string;
  name: string;
  status: string;
  city: string | null;
  country_code: string | null;
  image_url: string | null;
  avatar_path: string | null;
  updated_at: string;
};

type HostsResponse = {
  items: HostItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

export default function MyHostsPage() {
  const { getToken, roles } = useKeycloakAuth();
  const { t } = useI18n();
  const [hosts, setHosts] = useState<HostItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isAdmin = roles.includes(ROLE_ADMIN);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ managedBy: "me", page: String(page), pageSize: String(pageSize) });
      if (search) params.set("q", search);
      const data = await authorizedGet<HostsResponse>(getToken, `/admin/organizers?${params}`);
      setHosts(data.items);
      setTotalItems(data.pagination.totalItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load hosts");
    } finally {
      setLoading(false);
    }
  }, [getToken, page, search]);

  useEffect(() => { void load(); }, [load]);

  const pageStart = (page - 1) * pageSize + 1;
  const pageEnd = (page - 1) * pageSize + hosts.length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 className="manage-page-title" style={{ marginBottom: 0 }}>{t("manage.hosts.title")}</h1>
        <Link href="/manage/hosts/new" className="primary-btn">{t("manage.hosts.createHost")}</Link>
      </div>

      <div className="manage-filter-bar">
        <input
          placeholder="Search hosts..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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

      {!error && loading ? (
        <div className="manage-loading">Loading hosts...</div>
      ) : !error && hosts.length === 0 ? (
        <div className="manage-empty">
          {isAdmin ? (
            <>
              <h3>{t("manage.hosts.emptyAdmin")}</h3>
              <Link href="/manage/admin/hosts" className="secondary-btn" style={{ marginTop: 12, display: "inline-block" }}>
                All Hosts
              </Link>
            </>
          ) : (
            <>
              <h3>{t("manage.hosts.noHosts")}</h3>
              <p>{t("manage.hosts.createFirstDescription")}</p>
              <Link href="/manage/hosts/new" className="primary-btn" style={{ marginTop: 12, display: "inline-block" }}>
                {t("manage.hosts.createHost")}
              </Link>
            </>
          )}
        </div>
      ) : !error ? (
        <>
          <div className={`manage-cards-grid${loading ? " manage-list-loading" : ""}`}>
            {hosts.map((host) => (
              <div key={host.id} className="manage-event-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Link href={`/manage/hosts/${host.id}`} style={{ fontWeight: 600, textDecoration: "none", color: "var(--ink)" }}>
                    {host.name}
                  </Link>
                  <StatusBadge status={host.status} />
                </div>
                <div className="manage-event-card-meta">
                  {host.city && <span>{host.city}</span>}
                  {host.city && host.country_code && <span> · </span>}
                  {host.country_code && <span>{host.country_code}</span>}
                  {!host.city && !host.country_code && <span>No location</span>}
                </div>
                <div className="manage-event-card-actions">
                  <Link href={`/manage/hosts/${host.id}`} className="secondary-btn" style={{ fontSize: "0.85rem" }}>
                    Edit
                  </Link>
                  <Link href={`/hosts/${host.slug}`} className="ghost-btn" style={{ fontSize: "0.85rem" }}>
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
          {(page > 1 || hosts.length === pageSize) && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {page > 1 && (
                <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>Previous</button>
              )}
              {hosts.length === pageSize && (
                <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>Next</button>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

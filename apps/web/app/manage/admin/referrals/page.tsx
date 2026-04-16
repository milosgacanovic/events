"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../../components/i18n/I18nProvider";
import { authorizedGet } from "../../../../lib/manageApi";

type Stats = {
  total: number;
  uniqueSenders: number;
  uniqueRecipients: number;
};

type ReferralItem = {
  id: string;
  sender_name: string | null;
  sender_email: string | null;
  recipient_email: string;
  event_id: string;
  event_title: string;
  note: string | null;
  sent_at: string;
};

type ReferralsResponse = {
  items: ReferralItem[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
};

export default function AdminReferralsPage() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();

  const [stats, setStats] = useState<Stats | null>(null);
  const [referrals, setReferrals] = useState<ReferralItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [senderSearch, setSenderSearch] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");

  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (senderSearch) params.set("sender", senderSearch);
      if (recipientSearch) params.set("recipient", recipientSearch);

      const [statsData, referralsData] = await Promise.all([
        authorizedGet<Stats>(getToken, "/admin/recommendations/stats"),
        authorizedGet<ReferralsResponse>(getToken, `/admin/recommendations?${params}`),
      ]);
      setStats(statsData);
      setReferrals(referralsData.items);
      setTotalItems(referralsData.pagination.totalItems);
    } finally {
      setLoading(false);
    }
  }, [getToken, page, senderSearch, recipientSearch]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <h1 className="manage-page-title">{t("manage.admin.referrals.title")}</h1>

      {/* Stats cards */}
      {stats && (
        <div className="manage-cards-grid" style={{ marginBottom: 24 }}>
          <div className="manage-stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">{t("manage.admin.referrals.total")}</div>
          </div>
          <div className="manage-stat-card">
            <div className="stat-value">{stats.uniqueSenders}</div>
            <div className="stat-label">{t("manage.admin.referrals.uniqueSenders")}</div>
          </div>
          <div className="manage-stat-card">
            <div className="stat-value">{stats.uniqueRecipients}</div>
            <div className="stat-label">{t("manage.admin.referrals.uniqueRecipients")}</div>
          </div>
        </div>
      )}

      {/* Search filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="text"
          className="manage-search-input"
          placeholder={t("manage.admin.referrals.searchSender")}
          value={senderSearch}
          onChange={(e) => { setSenderSearch(e.target.value); setPage(1); }}
        />
        <input
          type="text"
          className="manage-search-input"
          placeholder={t("manage.admin.referrals.searchRecipient")}
          value={recipientSearch}
          onChange={(e) => { setRecipientSearch(e.target.value); setPage(1); }}
        />
        <span className="meta" style={{ marginLeft: "auto", alignSelf: "center" }}>
          {t("manage.pagination.showing", { start: (page - 1) * pageSize + 1, end: (page - 1) * pageSize + referrals.length, total: totalItems })}
        </span>
      </div>

      {loading ? (
        <div className="manage-loading">{t("manage.common.loading")}</div>
      ) : referrals.length === 0 ? (
        <div className="manage-empty"><h3>{t("manage.admin.referrals.noResults")}</h3></div>
      ) : (
        <>
          <div className="manage-table-wrap">
            <table className="manage-table">
              <thead>
                <tr>
                  <th>{t("manage.admin.referrals.date")}</th>
                  <th>{t("manage.admin.referrals.sender")}</th>
                  <th>{t("manage.admin.referrals.recipient")}</th>
                  <th>{t("manage.admin.referrals.event")}</th>
                  <th>{t("manage.admin.referrals.note")}</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(r.sent_at).toLocaleDateString()}</td>
                    <td>
                      <div>{r.sender_name ?? "\u2014"}</div>
                      {r.sender_email && <div className="meta" style={{ fontSize: "0.75rem" }}>{r.sender_email}</div>}
                    </td>
                    <td>{r.recipient_email}</td>
                    <td>
                      <a href={`/events/${r.event_id}`} target="_blank" rel="noopener noreferrer">
                        {r.event_title}
                      </a>
                    </td>
                    <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.note ?? "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="manage-pagination" style={{ marginTop: 12 }}>
            {page > 1 && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p - 1)}>{t("manage.common.previous")}</button>}
            {referrals.length === pageSize && <button type="button" className="secondary-btn" onClick={() => setPage((p) => p + 1)}>{t("manage.common.next")}</button>}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { apiBase } from "../../../lib/api";
import {
  FollowHostModal,
  type ExistingAlert,
  type ProfileDefaults,
} from "../../../components/FollowHostModal";

type AlertListItem = {
  id: string;
  organizerId: string;
  organizerName: string;
  organizerSlug: string;
  organizerImageUrl: string | null;
  organizerPractice: string | null;
  organizerRole: string | null;
  radiusKm: number;
  lat: number | null;
  lng: number | null;
  locationLabel: string | null;
  city: string | null;
  countryCode: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
};

type ProfilePayload = {
  homeLat: number | null;
  homeLng: number | null;
  homeLocationLabel: string | null;
  homeCity: string | null;
  homeCountryCode: string | null;
  defaultRadiusKm: number | null;
};

export default function FollowingTab() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const [alerts, setAlerts] = useState<AlertListItem[]>([]);
  const [profileDefaults, setProfileDefaults] = useState<ProfileDefaults | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingAlert, setEditingAlert] = useState<AlertListItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const [alertsRes, profileRes] = await Promise.all([
        fetch(`${apiBase}/profile/alerts`, { headers, cache: "no-store" }),
        fetch(`${apiBase}/profile`, { headers, cache: "no-store" }),
      ]);
      if (alertsRes.ok) {
        const data = (await alertsRes.json()) as { items: AlertListItem[] };
        setAlerts(data.items);
      }
      if (profileRes.ok) {
        const p = (await profileRes.json()) as ProfilePayload;
        if (p.homeLat != null && p.homeLng != null) {
          setProfileDefaults({
            homeLat: p.homeLat,
            homeLng: p.homeLng,
            homeLocationLabel: p.homeLocationLabel,
            homeCity: p.homeCity,
            homeCountryCode: p.homeCountryCode,
            defaultRadiusKm: p.defaultRadiusKm,
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  async function unfollow(id: string) {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${apiBase}/profile/alerts/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setAlerts((cur) => cur.filter((a) => a.id !== id));
  }

  if (loading) return <p className="muted">{t("profile.loading")}</p>;

  if (alerts.length === 0) {
    return (
      <div className="manage-empty">
        <p className="muted">{t("profile.alerts.empty")}</p>
        <a href="/hosts" className="primary-btn" style={{ display: "inline-block", marginTop: 8 }}>
          {t("profile.alerts.browseHosts")}
        </a>
      </div>
    );
  }

  return (
    <>
      <ul className="alerts-list">
        {alerts.map((alert) => (
          <li key={alert.id} className="alerts-item">
            {alert.organizerImageUrl && (
              <a href={`/hosts/${alert.organizerSlug}`} className="alerts-item-avatar">
                <img src={alert.organizerImageUrl} alt="" loading="lazy" />
              </a>
            )}
            <div className="alerts-item-main">
              <a href={`/hosts/${alert.organizerSlug}`} className="alerts-item-host">
                {alert.organizerName}
              </a>
              {(alert.organizerPractice || alert.organizerRole) && (
                <div className="meta" style={{ fontSize: "0.85rem" }}>
                  {[alert.organizerPractice, alert.organizerRole].filter(Boolean).join(" \u2013 ")}
                </div>
              )}
              <div className="meta">
                {alert.locationLabel ?? t("profile.alerts.locationAnywhere")}
                {alert.lat != null && ` \u00B7 ${t("profile.alerts.radius", { km: alert.radiusKm })}`}
                {alert.unsubscribedAt && ` \u00B7 ${t("profile.alerts.unsubscribed")}`}
              </div>
            </div>
            <div className="alerts-item-actions">
              <button className="primary-btn" type="button" onClick={() => setEditingAlert(alert)}>
                {t("profile.alerts.edit")}
              </button>
              <button className="primary-btn" type="button" onClick={() => void unfollow(alert.id)}>
                {t("profile.alerts.unfollow")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {editingAlert && (
        <FollowHostModal
          organizerId={editingAlert.organizerId}
          organizerName={editingAlert.organizerName}
          existing={{
            id: editingAlert.id,
            organizerId: editingAlert.organizerId,
            radiusKm: editingAlert.radiusKm,
            lat: editingAlert.lat,
            lng: editingAlert.lng,
            locationLabel: editingAlert.locationLabel,
            city: editingAlert.city,
            countryCode: editingAlert.countryCode,
          }}
          profileDefaults={profileDefaults}
          onClose={() => setEditingAlert(null)}
          onSaved={(saved: ExistingAlert) => {
            setAlerts((cur) =>
              cur.map((a) =>
                a.id === saved.id
                  ? { ...a, radiusKm: saved.radiusKm, lat: saved.lat, lng: saved.lng, locationLabel: saved.locationLabel, city: saved.city, countryCode: saved.countryCode }
                  : a,
              ),
            );
          }}
          onDeleted={() => {
            setAlerts((cur) => cur.filter((a) => a.id !== editingAlert.id));
          }}
        />
      )}
    </>
  );
}

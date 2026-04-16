"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { apiBase } from "../../../lib/api";

type RsvpItem = {
  id: string;
  eventId: string;
  occurrenceId: string | null;
  createdAt: string;
  eventTitle: string;
  eventSlug: string;
  singleStartAt: string | null;
  nextOccurrenceStart: string | null;
  coverImagePath: string | null;
};

export default function GoingTab() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<RsvpItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${apiBase}/profile/rsvps`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { items: RsvpItem[] };
        setItems(data.items);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  async function cancel(eventId: string) {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${apiBase}/profile/rsvps/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setItems((cur) => cur.filter((i) => i.eventId !== eventId));
  }

  if (loading) return <p className="muted">{t("profile.loading")}</p>;

  if (items.length === 0) return <p className="muted">{t("profile.rsvps.empty")}</p>;

  const now = Date.now();
  const upcoming = items.filter((r) => {
    const d = r.nextOccurrenceStart ?? r.singleStartAt;
    return !d || new Date(d).getTime() >= now;
  });
  const past = items.filter((r) => {
    const d = r.nextOccurrenceStart ?? r.singleStartAt;
    return d && new Date(d).getTime() < now;
  });

  function renderItem(item: RsvpItem) {
    return (
      <li key={item.id} className="saved-events-item">
        {item.coverImagePath && (
          <a href={`/events/${item.eventSlug}`} className="saved-events-thumb">
            <img src={item.coverImagePath} alt="" loading="lazy" />
          </a>
        )}
        <div className="saved-events-info">
          <a href={`/events/${item.eventSlug}`} className="saved-events-title">
            {item.eventTitle}
          </a>
          <div className="meta">
            {(item.nextOccurrenceStart ?? item.singleStartAt) &&
              new Date(item.nextOccurrenceStart ?? item.singleStartAt!).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
          </div>
        </div>
        <button className="secondary-btn" type="button" onClick={() => void cancel(item.eventId)}>
          {t("profile.rsvps.cancel")}
        </button>
      </li>
    );
  }

  return (
    <>
      {upcoming.length > 0 && (
        <ul className="saved-events-list">{upcoming.map(renderItem)}</ul>
      )}
      {past.length > 0 && (
        <>
          <h3 className="title-s" style={{ marginTop: 16 }}>{t("profile.rsvps.past")}</h3>
          <ul className="saved-events-list">{past.map(renderItem)}</ul>
        </>
      )}
    </>
  );
}

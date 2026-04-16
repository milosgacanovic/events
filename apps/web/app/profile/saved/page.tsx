"use client";

import { useCallback, useEffect, useState } from "react";

import { useKeycloakAuth } from "../../../components/auth/KeycloakAuthProvider";
import { useI18n } from "../../../components/i18n/I18nProvider";
import { apiBase } from "../../../lib/api";

type SavedEventItem = {
  id: string;
  eventId: string;
  occurrenceId: string | null;
  scope: string;
  createdAt: string;
  eventTitle: string;
  eventSlug: string;
  eventStatus: string;
  singleStartAt: string | null;
  nextOccurrenceStart: string | null;
  coverImagePath: string | null;
};

export default function SavedEventsTab() {
  const { getToken } = useKeycloakAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<SavedEventItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${apiBase}/profile/saved-events`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { items: SavedEventItem[] };
        setItems(data.items);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  async function unsave(eventId: string) {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`${apiBase}/profile/saved-events/${eventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setItems((cur) => cur.filter((i) => i.eventId !== eventId));
  }

  if (loading) return <p className="muted">{t("profile.loading")}</p>;

  if (items.length === 0) return <p className="muted">{t("profile.savedEvents.empty")}</p>;

  return (
    <ul className="saved-events-list">
      {items.map((item) => (
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
              {item.scope === "all" && item.occurrenceId == null && (
                <> &middot; {t("profile.savedEvents.allSessions")}</>
              )}
            </div>
          </div>
          <button className="secondary-btn" type="button" onClick={() => void unsave(item.eventId)}>
            {t("profile.savedEvents.unsave")}
          </button>
        </li>
      ))}
    </ul>
  );
}

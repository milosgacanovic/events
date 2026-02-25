"use client";

import { useEffect, useState } from "react";

import { fetchJson } from "../lib/api";
import { useI18n } from "./i18n/I18nProvider";

type EventDetail = {
  event: {
    title: string;
    status: string;
    attendance_mode: string;
    languages: string[];
    tags: string[];
  };
  defaultLocation: {
    formatted_address: string;
  } | null;
  occurrences: {
    upcoming: Array<{
      id: string;
      starts_at_utc: string;
      status: string;
    }>;
    past: Array<{
      id: string;
      starts_at_utc: string;
      status: string;
    }>;
  };
};

export function EventDetailClient({ slug }: { slug: string }) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<EventDetail>(`/events/${slug}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t("eventDetail.error.fetchFailed")));
  }, [slug, t]);

  if (error) {
    return <div className="panel">{error}</div>;
  }

  if (!data) {
    return <div className="panel">{t("eventDetail.loading")}</div>;
  }

  return (
    <section className="panel cards">
      <h1 className="title-xl">{data.event.title}</h1>
      <div className="meta">{t("eventDetail.statusLabel", { status: data.event.status })}</div>
      <div className="meta">
        {t("eventDetail.attendanceLabel", {
          attendance: t(`attendanceMode.${data.event.attendance_mode}`),
        })}
      </div>
      <div className="meta">
        {t("eventDetail.locationLabel", {
          location: data.defaultLocation?.formatted_address ?? t("eventDetail.locationTbd"),
        })}
      </div>
      <div className="kv">
        {data.event.languages.map((item) => (
          <span className="tag" key={item}>
            {item}
          </span>
        ))}
        {data.event.tags.map((item) => (
          <span className="tag" key={item}>
            {item}
          </span>
        ))}
      </div>

      <h3>{t("eventDetail.upcoming")}</h3>
      {data.occurrences.upcoming.length === 0 && <div className="muted">{t("eventDetail.noUpcoming")}</div>}
      {data.occurrences.upcoming.map((occurrence) => (
        <div className="card" key={occurrence.id}>
          {new Date(occurrence.starts_at_utc).toLocaleString(locale)} ({occurrence.status})
        </div>
      ))}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchJson } from "../lib/api";
import { useI18n } from "./i18n/I18nProvider";

type OrganizerDetail = {
  organizer: {
    name: string;
    website_url: string | null;
    tags: string[];
    languages: string[];
  };
  upcomingOccurrences: Array<{
    occurrence_id: string;
    starts_at_utc: string;
    event_slug: string;
    event_title: string;
  }>;
};

export function OrganizerDetailClient({ slug }: { slug: string }) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<OrganizerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<OrganizerDetail>(`/organizers/${slug}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t("organizerDetail.error.fetchFailed")));
  }, [slug, t]);

  if (error) {
    return <div className="panel">{error}</div>;
  }

  if (!data) {
    return <div className="panel">{t("organizerDetail.loading")}</div>;
  }

  return (
    <section className="panel cards">
      <h1 className="title-xl">{data.organizer.name}</h1>
      {data.organizer.website_url && (
        <div className="meta">
          <a href={data.organizer.website_url} target="_blank" rel="noreferrer">
            {data.organizer.website_url}
          </a>
        </div>
      )}
      <div className="kv">
        {data.organizer.languages.map((item) => (
          <span className="tag" key={item}>
            {item}
          </span>
        ))}
        {data.organizer.tags.map((item) => (
          <span className="tag" key={item}>
            {item}
          </span>
        ))}
      </div>

      <h3>{t("organizerDetail.upcomingEvents")}</h3>
      {data.upcomingOccurrences.length === 0 && <div className="muted">{t("organizerDetail.noUpcoming")}</div>}
      {data.upcomingOccurrences.map((item) => (
        <div className="card" key={item.occurrence_id}>
          <Link href={`/events/${item.event_slug}`}>{item.event_title}</Link>
          <div className="meta">{new Date(item.starts_at_utc).toLocaleString(locale)}</div>
        </div>
      ))}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchJson } from "../lib/api";

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
  const [data, setData] = useState<OrganizerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<OrganizerDetail>(`/organizers/${slug}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, [slug]);

  if (error) {
    return <div className="panel">{error}</div>;
  }

  if (!data) {
    return <div className="panel">Loading organizer...</div>;
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

      <h3>Upcoming events</h3>
      {data.upcomingOccurrences.length === 0 && <div className="muted">No upcoming occurrences.</div>}
      {data.upcomingOccurrences.map((item) => (
        <div className="card" key={item.occurrence_id}>
          <Link href={`/events/${item.event_slug}`}>{item.event_title}</Link>
          <div className="meta">{new Date(item.starts_at_utc).toLocaleString()}</div>
        </div>
      ))}
    </section>
  );
}

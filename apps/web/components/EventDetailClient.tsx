"use client";

import { useEffect, useState } from "react";

import { fetchJson } from "../lib/api";

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
  const [data, setData] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<EventDetail>(`/events/${slug}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed"));
  }, [slug]);

  if (error) {
    return <div className="panel">{error}</div>;
  }

  if (!data) {
    return <div className="panel">Loading event...</div>;
  }

  return (
    <section className="panel cards">
      <h1 className="title-xl">{data.event.title}</h1>
      <div className="meta">Status: {data.event.status}</div>
      <div className="meta">Attendance: {data.event.attendance_mode}</div>
      <div className="meta">Location: {data.defaultLocation?.formatted_address ?? "TBD"}</div>
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

      <h3>Upcoming</h3>
      {data.occurrences.upcoming.length === 0 && <div className="muted">No upcoming occurrences.</div>}
      {data.occurrences.upcoming.map((occurrence) => (
        <div className="card" key={occurrence.id}>
          {new Date(occurrence.starts_at_utc).toLocaleString()} ({occurrence.status})
        </div>
      ))}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { fetchJson } from "../lib/api";

type OrganizerSearchResponse = {
  items: Array<{
    id: string;
    slug: string;
    name: string;
    tags: string[];
    languages: string[];
    city: string | null;
    country_code: string | null;
  }>;
  total: number;
};

export function OrganizerSearchClient() {
  const [q, setQ] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OrganizerSearchResponse | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (countryCode.trim()) params.set("countryCode", countryCode.trim());
    params.set("page", "1");
    params.set("pageSize", "20");
    return params.toString();
  }, [q, countryCode]);

  async function runSearch() {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchJson<OrganizerSearchResponse>(`/organizers/search?${queryString}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grid">
      <aside className="panel filters">
        <h2 className="title-xl">Organizer Directory</h2>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search name" />
        <input
          value={countryCode}
          onChange={(event) => setCountryCode(event.target.value)}
          placeholder="Country code (e.g. us)"
        />
        <button type="button" onClick={runSearch} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </aside>

      <div className="panel cards">
        <div className="meta">{data ? `${data.total} organizers` : "Run a search to load organizers."}</div>
        {error && <div className="muted">{error}</div>}

        {data?.items.map((item) => (
          <article className="card" key={item.id}>
            <h3>
              <Link href={`/organizers/${item.slug}`}>{item.name}</Link>
            </h3>
            <div className="meta">
              {item.city ?? ""}
              {item.country_code ? ` ${item.country_code.toUpperCase()}` : ""}
            </div>
            <div className="kv">
              {item.languages.map((language) => (
                <span className="tag" key={language}>
                  {language}
                </span>
              ))}
              {item.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

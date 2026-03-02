"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchJson } from "../lib/api";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";

type OrganizerDetail = {
  organizer: {
    id: string;
    name: string;
    website_url: string | null;
    tags: string[];
    languages: string[];
    avatar_path: string | null;
    description_json: unknown;
  };
  locations: Array<{
    id: string;
    label: string | null;
    formatted_address: string | null;
    city: string | null;
    country_code: string | null;
    lat: number | null;
    lng: number | null;
  }>;
  upcomingOccurrences: Array<{
    occurrence_id: string;
    starts_at_utc: string;
    event_slug: string;
    event_title: string;
  }>;
  pastOccurrences: Array<{
    occurrence_id: string;
    starts_at_utc: string;
    event_slug: string;
    event_title: string;
  }>;
};

function collectText(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      output.push(trimmed);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectText(item, output);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      collectText(nestedValue, output);
    }
  }
}

function getDescriptionText(value: unknown): string | null {
  const parts: string[] = [];
  collectText(value, parts);
  const normalized = parts.join(" ").replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function OrganizerDetailClient({ slug }: { slug: string }) {
  const { locale, t } = useI18n();
  const auth = useKeycloakAuth();
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

  const description = getDescriptionText(data.organizer.description_json);
  const hasEditorRole = auth.roles.some((role) =>
    role === "dr_events_admin" || role === "dr_events_editor" || role === "admin" || role === "editor"
  );
  const canEdit = auth.ready && auth.authenticated && hasEditorRole;

  return (
    <section className="panel cards">
      <h1 className="title-xl">{data.organizer.name}</h1>
      {canEdit && (
        <div>
          <Link
            className="secondary-btn"
            href={`/admin?section=organizers&id=${encodeURIComponent(data.organizer.id)}`}
          >
            {t("organizerDetail.editHost")}
          </Link>
        </div>
      )}
      {data.organizer.avatar_path && (
        <div className="event-host-row">
          <img className="event-host-avatar" src={data.organizer.avatar_path} alt={data.organizer.name} />
        </div>
      )}
      {data.organizer.website_url && (
        <div className="meta">
          <a href={data.organizer.website_url} target="_blank" rel="noreferrer">
            {data.organizer.website_url}
          </a>
        </div>
      )}
      {description && (
        <div>
          <h3>{t("organizerDetail.descriptionLabel")}</h3>
          <div className="meta">{description}</div>
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

      <h3>{t("organizerDetail.locations")}</h3>
      {data.locations.length === 0 && <div className="muted">{t("organizerDetail.noLocations")}</div>}
      {data.locations.map((location) => {
        const mapHref =
          location.lat !== null &&
          location.lat !== undefined &&
          location.lng !== null &&
          location.lng !== undefined
            ? `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=16/${location.lat}/${location.lng}`
            : null;

        return (
          <div className="card" key={location.id}>
            <div>{location.label || location.formatted_address || t("common.unknown")}</div>
            {(location.city || location.country_code) && (
              <div className="meta">
                {location.city ?? ""}
                {location.country_code
                  ? `${location.city ? ", " : ""}${location.country_code.toUpperCase()}`
                  : ""}
              </div>
            )}
            {mapHref && (
              <div className="meta">
                <a href={mapHref} target="_blank" rel="noreferrer">
                  {t("organizerDetail.openMap")}
                </a>
              </div>
            )}
          </div>
        );
      })}

      <h3>{t("organizerDetail.upcomingEvents")}</h3>
      {data.upcomingOccurrences.length === 0 && <div className="muted">{t("organizerDetail.noUpcoming")}</div>}
      {data.upcomingOccurrences.map((item) => (
        <div className="card" key={item.occurrence_id}>
          <Link href={`/events/${item.event_slug}`}>{item.event_title}</Link>
          <div className="meta">{new Date(item.starts_at_utc).toLocaleString(locale)}</div>
        </div>
      ))}

      <h3>{t("organizerDetail.pastEvents")}</h3>
      {data.pastOccurrences.length === 0 && <div className="muted">{t("organizerDetail.noPast")}</div>}
      {data.pastOccurrences.map((item) => (
        <div className="card" key={item.occurrence_id}>
          <Link href={`/events/${item.event_slug}`}>{item.event_title}</Link>
          <div className="meta">{new Date(item.starts_at_utc).toLocaleString(locale)}</div>
        </div>
      ))}
    </section>
  );
}

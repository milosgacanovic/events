"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { fetchJson } from "../lib/api";
import { useI18n } from "./i18n/I18nProvider";

type TaxonomyResponse = {
  uiLabels: {
    categorySingular?: string;
    practiceCategory?: string;
  };
  practices: {
    categories: Array<{
      id: string;
      label: string;
      subcategories: Array<{
        id: string;
        label: string;
      }>;
    }>;
  };
};

type EventDetail = {
  event: {
    title: string;
    status: string;
    attendance_mode: string;
    languages: string[];
    tags: string[];
    cover_image_path: string | null;
    external_url: string | null;
    description_json: unknown;
    practice_category_id: string;
    practice_subcategory_id: string | null;
  };
  organizers: Array<{
    organizer_id: string;
    organizer_slug: string;
    organizer_name: string;
    organizer_avatar_path: string | null;
    role_key: string;
    role_label: string;
  }>;
  defaultLocation: {
    formatted_address: string;
    lat: number | null;
    lng: number | null;
  } | null;
  occurrences: {
    upcoming: Array<{
      id: string;
      starts_at_utc: string;
      ends_at_utc: string;
      status: string;
      city: string | null;
      country_code: string | null;
    }>;
    past: Array<{
      id: string;
      starts_at_utc: string;
      ends_at_utc: string;
      status: string;
      city: string | null;
      country_code: string | null;
    }>;
  };
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

export function EventDetailClient({ slug }: { slug: string }) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<EventDetail | null>(null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = (value: string) => {
    const key = `common.status.${value}`;
    const localized = t(key);
    return localized === key ? value : localized;
  };

  useEffect(() => {
    let active = true;

    Promise.all([
      fetchJson<EventDetail>(`/events/${slug}`),
      fetchJson<TaxonomyResponse>("/meta/taxonomies").catch(() => null),
    ])
      .then(([eventData, taxonomyData]) => {
        if (!active) {
          return;
        }

        setData(eventData);
        setTaxonomy(taxonomyData);
      })
      .catch((err) => {
        if (!active) {
          return;
        }

        setError(err instanceof Error ? err.message : t("eventDetail.error.fetchFailed"));
      });

    return () => {
      active = false;
    };
  }, [slug, t]);

  const hosts = useMemo(() => {
    if (!data) {
      return [] as Array<{
        id: string;
        slug: string;
        name: string;
        avatarPath: string | null;
        roles: string[];
      }>;
    }

    const byId = new Map<
      string,
      { id: string; slug: string; name: string; avatarPath: string | null; roles: string[] }
    >();

    for (const row of data.organizers) {
      const role = row.role_label || row.role_key;
      const existing = byId.get(row.organizer_id);

      if (existing) {
        if (!existing.roles.includes(role)) {
          existing.roles.push(role);
        }
      } else {
        byId.set(row.organizer_id, {
          id: row.organizer_id,
          slug: row.organizer_slug,
          name: row.organizer_name,
          avatarPath: row.organizer_avatar_path,
          roles: role ? [role] : [],
        });
      }
    }

    return Array.from(byId.values());
  }, [data]);

  const categorySingularLabel =
    taxonomy?.uiLabels.categorySingular ??
    taxonomy?.uiLabels.practiceCategory ??
    t("common.category");

  const categoryById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of taxonomy?.practices.categories ?? []) {
      map.set(category.id, category.label);
    }
    return map;
  }, [taxonomy]);

  const subcategoryById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of taxonomy?.practices.categories ?? []) {
      for (const subcategory of category.subcategories) {
        map.set(subcategory.id, subcategory.label);
      }
    }
    return map;
  }, [taxonomy]);

  if (error) {
    return <div className="panel">{error}</div>;
  }

  if (!data) {
    return <div className="panel">{t("eventDetail.loading")}</div>;
  }

  const description = getDescriptionText(data.event.description_json);
  const categoryLabel = categoryById.get(data.event.practice_category_id) ?? data.event.practice_category_id;
  const subcategoryLabel = data.event.practice_subcategory_id
    ? subcategoryById.get(data.event.practice_subcategory_id) ?? data.event.practice_subcategory_id
    : null;
  const mapHref =
    data.defaultLocation?.lat !== null &&
    data.defaultLocation?.lat !== undefined &&
    data.defaultLocation?.lng !== null &&
    data.defaultLocation?.lng !== undefined
      ? `https://www.openstreetmap.org/?mlat=${data.defaultLocation.lat}&mlon=${data.defaultLocation.lng}#map=16/${data.defaultLocation.lat}/${data.defaultLocation.lng}`
      : null;

  return (
    <section className="panel cards">
      <h1 className="title-xl">{data.event.title}</h1>
      {data.event.cover_image_path && (
        <img
          className="event-cover"
          src={data.event.cover_image_path}
          alt={data.event.title}
        />
      )}

      <div className="meta">{t("eventDetail.statusLabel", { status: statusLabel(data.event.status) })}</div>
      <div className="meta">
        {t("eventDetail.attendanceLabel", {
          attendance: t(`attendanceMode.${data.event.attendance_mode}`),
        })}
      </div>
      <div className="meta">
        {categorySingularLabel}: {categoryLabel}
      </div>
      {subcategoryLabel && (
        <div className="meta">
          {t("common.subcategory")}: {subcategoryLabel}
        </div>
      )}
      <div className="meta">
        {t("eventDetail.locationLabel", {
          location: data.defaultLocation?.formatted_address ?? t("eventDetail.locationTbd"),
        })}
      </div>
      {mapHref && (
        <div className="meta">
          <a href={mapHref} target="_blank" rel="noreferrer">
            {t("eventDetail.openMap")}
          </a>
        </div>
      )}
      {data.event.external_url && (
        <div className="meta">
          {t("common.field.websiteUrl")}: <a href={data.event.external_url} target="_blank" rel="noreferrer">{data.event.external_url}</a>
        </div>
      )}
      {description && (
        <div>
          <h3>{t("eventDetail.descriptionLabel")}</h3>
          <div className="meta">{description}</div>
        </div>
      )}

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

      <h3>{t("eventDetail.hosts")}</h3>
      {hosts.length === 0 && <div className="muted">{t("eventDetail.noHosts")}</div>}
      {hosts.map((host) => (
        <div className="card" key={host.id}>
          <div className="event-host-row">
            {host.avatarPath && <img className="event-host-avatar" src={host.avatarPath} alt={host.name} />}
            <div>
              <Link href={`/organizers/${host.slug}`}>{host.name}</Link>
              {host.roles.length > 0 && <div className="meta">{host.roles.join(", ")}</div>}
            </div>
          </div>
        </div>
      ))}

      <h3>{t("eventDetail.upcoming")}</h3>
      {data.occurrences.upcoming.length === 0 && <div className="muted">{t("eventDetail.noUpcoming")}</div>}
      {data.occurrences.upcoming.map((occurrence) => (
        <div className="card" key={occurrence.id}>
          {new Date(occurrence.starts_at_utc).toLocaleString(locale)} ({statusLabel(occurrence.status)})
          {(occurrence.city || occurrence.country_code) && (
            <div className="meta">
              {occurrence.city ?? ""}
              {occurrence.country_code ? `${occurrence.city ? ", " : ""}${occurrence.country_code.toUpperCase()}` : ""}
            </div>
          )}
        </div>
      ))}

      <h3>{t("eventDetail.past")}</h3>
      {data.occurrences.past.length === 0 && <div className="muted">{t("eventDetail.noPast")}</div>}
      {data.occurrences.past.map((occurrence) => (
        <div className="card" key={occurrence.id}>
          {new Date(occurrence.starts_at_utc).toLocaleString(locale)} ({statusLabel(occurrence.status)})
          {(occurrence.city || occurrence.country_code) && (
            <div className="meta">
              {occurrence.city ?? ""}
              {occurrence.country_code ? `${occurrence.city ? ", " : ""}${occurrence.country_code.toUpperCase()}` : ""}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

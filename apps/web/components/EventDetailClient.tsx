"use client";

import DOMPurify from "dompurify";
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
    single_start_at: string | null;
    single_end_at: string | null;
    event_timezone: string;
    attendance_mode: "in_person" | "online" | "hybrid";
    languages: string[];
    external_source: string | null;
    updated_at: string;
    cover_image_path: string | null;
    coverImageUrl?: string | null;
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
    city: string | null;
    country_code: string | null;
  } | null;
};

function getDescriptionHtml(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const html = (value as Record<string, unknown>).html;
  if (typeof html !== "string") {
    return null;
  }

  const trimmed = html.trim();
  return trimmed || null;
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function EventDetailClient({ slug }: { slug: string }) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<EventDetail | null>(null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

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

        setNotFound(false);
        setError(null);
        setData(eventData);
        setTaxonomy(taxonomyData);
      })
      .catch((err) => {
        if (!active) {
          return;
        }

        const message = err instanceof Error ? err.message : t("eventDetail.error.fetchFailed");
        if (message.includes("404")) {
          setNotFound(true);
          return;
        }
        setError(message);
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

  const rawDescriptionHtml = useMemo(
    () => getDescriptionHtml(data?.event.description_json),
    [data?.event.description_json],
  );
  const sanitizedDescriptionHtml = useMemo(
    () => (rawDescriptionHtml ? DOMPurify.sanitize(rawDescriptionHtml) : null),
    [rawDescriptionHtml],
  );
  const descriptionSummary = useMemo(() => {
    if (!sanitizedDescriptionHtml) {
      return null;
    }
    const stripped = stripHtml(sanitizedDescriptionHtml);
    if (!stripped) {
      return null;
    }
    return stripped.length > 160 ? `${stripped.slice(0, 160)}...` : stripped;
  }, [sanitizedDescriptionHtml]);

  useEffect(() => {
    if (!data) {
      return;
    }

    document.title = `${data.event.title} | DanceResource`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta && descriptionSummary) {
      meta.setAttribute("content", descriptionSummary);
    }
  }, [data, descriptionSummary]);

  if (notFound) {
    return (
      <section className="panel cards">
        <h1 className="title-xl">{t("eventDetail.notFound.title")}</h1>
        <p className="muted">{t("eventDetail.notFound.description")}</p>
        <p>
          <Link href="/events">{t("eventDetail.notFound.backToEvents")}</Link>
        </p>
      </section>
    );
  }

  if (error) {
    return <div className="panel">{error}</div>;
  }

  if (!data) {
    return (
      <section className="panel cards">
        <h1 className="title-xl">{t("eventDetail.loading")}</h1>
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
        <div className="skeleton-block" />
      </section>
    );
  }

  const categoryLabel = categoryById.get(data.event.practice_category_id) ?? data.event.practice_category_id;
  const start = data.event.single_start_at ? new Date(data.event.single_start_at) : null;
  const end = data.event.single_end_at ? new Date(data.event.single_end_at) : null;

  const whenLabel = start && end
    ? `${start.toLocaleString(locale)} - ${end.toLocaleString(locale)} (${data.event.event_timezone})`
    : t("eventDetail.timeTbd");

  const modalityLabel = t(`attendanceMode.${data.event.attendance_mode}`);
  const locationLabel = data.defaultLocation?.city
    ? `${data.defaultLocation.city}${data.defaultLocation.country_code ? `, ${data.defaultLocation.country_code.toUpperCase()}` : ""}`
    : data.defaultLocation?.formatted_address ?? t("eventDetail.locationTbd");
  const importSource = data.event.external_source || t("common.none");
  const updatedLabel = data.event.updated_at ? new Date(data.event.updated_at).toLocaleString(locale) : null;
  const coverImageUrl = data.event.coverImageUrl ?? data.event.cover_image_path;

  return (
    <section className="panel cards">
      <h1 className="title-xl">{data.event.title}</h1>

      <div className="meta">{whenLabel} | {modalityLabel}</div>
      <div className="meta">
        {categorySingularLabel}: {categoryLabel}
        {data.event.practice_subcategory_id
          ? ` / ${subcategoryById.get(data.event.practice_subcategory_id) ?? data.event.practice_subcategory_id}`
          : ""}
      </div>
      <div className="meta">
        {data.event.attendance_mode === "online" ? t("attendanceMode.online") : locationLabel}
      </div>

      {coverImageUrl && (
        <img
          className="event-cover"
          src={coverImageUrl}
          alt={data.event.title}
          loading="lazy"
          decoding="async"
          style={{ maxHeight: 480, objectFit: "cover", width: "100%" }}
        />
      )}

      {sanitizedDescriptionHtml && (
        <div>
          <h3>{t("eventDetail.descriptionLabel")}</h3>
          <div
            className="meta"
            dangerouslySetInnerHTML={{ __html: sanitizedDescriptionHtml }}
          />
        </div>
      )}

      {hosts.length > 0 && (
        <>
          <h3>{t("eventDetail.hosts")}</h3>
          {hosts.map((host) => (
            <div className="card" key={host.id}>
              <div className="event-host-row">
                {host.avatarPath && <img className="event-host-avatar" src={host.avatarPath} alt={host.name} loading="lazy" />}
                <div>
                  <Link href={`/organizers/${host.slug}`}>{host.name}</Link>
                  {host.roles.length > 0 && <div className="meta">{host.roles.join(", ")}</div>}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {data.event.external_url && (
        <div>
          <a className="secondary-btn" href={data.event.external_url} target="_blank" rel="noreferrer">
            {t("eventDetail.externalLink")}
          </a>
        </div>
      )}

      <footer className="cards">
        <div className="meta">{t("eventDetail.metadata.languages")}</div>
        <div className="kv">
          {data.event.languages.map((item) => (
            <span className="tag" key={item}>
              {item}
            </span>
          ))}
          {data.event.languages.length === 0 && <span className="meta">{t("common.none")}</span>}
        </div>
        <div className="meta">{t("eventDetail.metadata.importSource", { value: importSource })}</div>
        {updatedLabel && <div className="meta">{t("eventDetail.metadata.lastUpdated", { value: updatedLabel })}</div>}
      </footer>
    </section>
  );
}

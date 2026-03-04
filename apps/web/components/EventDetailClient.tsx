"use client";

import DOMPurify from "dompurify";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchJson } from "../lib/api";
import { formatDateTimeRange, type TimeDisplayMode } from "../lib/datetime";
import { labelForLanguageCode } from "../lib/i18n/languageLabels";
import { getUserTimeZone, readTimeDisplayMode, writeTimeDisplayMode } from "../lib/timeDisplay";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";

export type TaxonomyResponse = {
  uiLabels: {
    categorySingular?: string;
    practiceCategory?: string;
  };
  practices: {
    categories: Array<{
      id: string;
      key?: string;
      label: string;
      subcategories: Array<{
        id: string;
        label: string;
      }>;
    }>;
  };
  eventFormats?: Array<{
    id: string;
    key: string;
    label: string;
  }>;
};

export type EventDetail = {
  event: {
    id: string;
    title: string;
    single_start_at: string | null;
    single_end_at: string | null;
    event_timezone: string;
    attendance_mode: "in_person" | "online" | "hybrid";
    languages: string[];
    external_source: string | null;
    is_imported: boolean;
    import_source: string | null;
    updated_at: string;
    lastSyncedAt?: string;
    schedule_kind: "single" | "recurring";
    cover_image_path: string | null;
    coverImageUrl?: string | null;
    external_url: string | null;
    externalUrl?: string | null;
    description_json: unknown;
    practice_category_id: string;
    practice_subcategory_id: string | null;
    event_format_id: string | null;
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
    lat: number | null;
    lng: number | null;
  } | null;
  occurrences: {
    upcoming: Array<{
      id: string;
      starts_at_utc: string;
      ends_at_utc: string;
      lat: number | null;
      lng: number | null;
    }>;
    past: Array<{
      id: string;
      starts_at_utc: string;
      ends_at_utc: string;
      lat: number | null;
      lng: number | null;
    }>;
  };
};

const EventDetailMap = dynamic(
  () => import("./EventDetailMap").then((module) => module.EventDetailMap),
  { ssr: false },
);

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

export function EventDetailClient({
  slug,
  initialData,
  initialTaxonomy,
}: {
  slug: string;
  initialData?: EventDetail | null;
  initialTaxonomy?: TaxonomyResponse | null;
}) {
  const { locale, t } = useI18n();
  const auth = useKeycloakAuth();
  const [data, setData] = useState<EventDetail | null>(initialData ?? null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(initialTaxonomy ?? null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [timeDisplayMode, setTimeDisplayMode] = useState<TimeDisplayMode>("user");
  const userTimeZone = useMemo(() => getUserTimeZone(), []);

  useEffect(() => {
    let active = true;

    if (initialData) {
      return () => {
        active = false;
      };
    }

    (async () => {
      const token = auth.authenticated ? await auth.getToken() : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      return Promise.all([
        fetchJson<EventDetail>(`/events/${slug}`, headers ? { headers } : undefined),
        fetchJson<TaxonomyResponse>("/meta/taxonomies").catch(() => null),
      ]);
    })()
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
  }, [auth.authenticated, auth.getToken, initialData, slug, t]);

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
  const eventFormatById = useMemo(() => {
    const map = new Map<string, string>();
    for (const format of taxonomy?.eventFormats ?? []) {
      map.set(format.id, format.label);
    }
    return map;
  }, [taxonomy]);
  const languageNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" });
    } catch {
      return null;
    }
  }, [locale]);
  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const getLanguageLabel = useCallback(
    (value: string) => labelForLanguageCode(value, languageNames),
    [languageNames],
  );
  const getCountryLabel = useCallback((value: string) => {
    const normalized = value.trim().toUpperCase();
    const localized = regionNames?.of(normalized);
    return localized && localized !== normalized ? localized : normalized;
  }, [regionNames]);

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

  useEffect(() => {
    setTimeDisplayMode(readTimeDisplayMode());
  }, []);

  useEffect(() => {
    writeTimeDisplayMode(timeDisplayMode);
  }, [timeDisplayMode]);

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
  const eventFormatLabel = data.event.event_format_id
    ? eventFormatById.get(data.event.event_format_id) ?? data.event.event_format_id
    : null;
  const whenFormatted = data.event.single_start_at && data.event.single_end_at
    ? formatDateTimeRange(
        data.event.single_start_at,
        data.event.single_end_at,
        data.event.event_timezone,
        timeDisplayMode,
      )
    : null;
  const whenLabel = whenFormatted?.primary ?? t("eventDetail.timeTbd");

  const modalityLabel = t(`attendanceMode.${data.event.attendance_mode}`);
  const locationLabel = data.defaultLocation?.city
    ? `${data.defaultLocation.city}${data.defaultLocation.country_code ? `, ${getCountryLabel(data.defaultLocation.country_code)}` : ""}`
    : data.defaultLocation?.formatted_address ?? t("eventDetail.locationTbd");
  const importSource = data.event.external_source || t("common.none");
  const updatedLabel = data.event.updated_at ? new Date(data.event.updated_at).toLocaleString(locale) : null;
  const coverImageUrl = data.event.coverImageUrl ?? data.event.cover_image_path;
  const externalUrl = data.event.externalUrl ?? data.event.external_url;
  const isImported = data.event.is_imported;
  const transparencySource = data.event.import_source ?? data.event.external_source ?? t("common.none");
  const hasEditorRole = auth.roles.some((role) =>
    role === "dr_events_admin" || role === "dr_events_editor" || role === "admin" || role === "editor"
  );
  const canEdit = auth.ready && auth.authenticated && hasEditorRole;
  const lastSyncedRaw = data.event.lastSyncedAt ?? data.event.updated_at;
  const lastSyncedUtc = new Date(lastSyncedRaw).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  const mapLat = data.defaultLocation?.lat ?? data.occurrences.upcoming[0]?.lat ?? null;
  const mapLng = data.defaultLocation?.lng ?? data.occurrences.upcoming[0]?.lng ?? null;
  const hasGeo = mapLat !== null && mapLng !== null;

  return (
    <section className="panel cards">
      <h1 className="title-xl">{data.event.title}</h1>
      {eventFormatLabel && <div className="meta">{eventFormatLabel}</div>}
      {canEdit && (
        <div>
          <Link className="secondary-btn" href={`/admin?section=events&id=${encodeURIComponent(data.event.id)}`}>
            {t("eventDetail.editEvent")}
          </Link>
        </div>
      )}

      <div className="meta">
        {whenLabel} ({whenFormatted?.suffixLabel === "event" ? t("common.eventTimezone") : t("common.yourTimezone")}) | {modalityLabel}
      </div>
      <label className="toggle-control">
        <input
          className="toggle-control-input"
          type="checkbox"
          checked={timeDisplayMode === "event"}
          onChange={(event) => setTimeDisplayMode(event.target.checked ? "event" : "user")}
        />
        <span className="toggle-control-track" aria-hidden />
        <span className="meta">
          {timeDisplayMode === "event"
            ? t("eventDetail.timeMode.eventWithZone", { zone: data.event.event_timezone || "UTC" })
            : t("eventDetail.timeMode.userWithZone", { zone: userTimeZone })}
        </span>
      </label>
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
        <div className="event-cover-shell">
          <img
            className="event-cover"
            src={coverImageUrl}
            alt={data.event.title}
            loading="lazy"
            decoding="async"
          />
        </div>
      )}

      {isImported && externalUrl && (
        <div className="import-disclaimer import-disclaimer-top">
          {t("eventDetail.import.officialBooking")}{" "}
          <a href={externalUrl} target="_blank" rel="noreferrer">
            {externalUrl}
          </a>
        </div>
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

      {isImported && externalUrl && (
        <div className="import-disclaimer">
          <div>{t("eventDetail.import.sharedWithCare")}</div>
          <div>{t("eventDetail.import.sourceLine", { source: transparencySource })}</div>
          <div>
            {t("eventDetail.import.officialLink")}{" "}
            <a href={externalUrl} target="_blank" rel="noreferrer">
              {externalUrl}
            </a>
          </div>
          <div>{t("eventDetail.import.lastSynced", { value: `${lastSyncedUtc} UTC` })}</div>
          <div>{t("eventDetail.import.contact")}</div>
        </div>
      )}

      {data.event.schedule_kind === "single" ? (
        <div>
          <h3>{t("common.scheduleKind.single")}</h3>
          <div className="meta">{whenLabel}</div>
        </div>
      ) : (
        <>
          <div>
            <h3>{t("eventDetail.upcoming")}</h3>
            {data.occurrences.upcoming.length === 0 && <div className="meta">{t("eventDetail.noUpcoming")}</div>}
            {data.occurrences.upcoming.map((item) => {
              const formatted = formatDateTimeRange(
                item.starts_at_utc,
                item.ends_at_utc,
                data.event.event_timezone,
                timeDisplayMode,
              );
              return (
                <div className="card" key={item.id}>
                  <div className="meta">
                    {formatted.primary} ({formatted.suffixLabel === "event"
                      ? t("common.eventTimezone")
                      : t("common.yourTimezone")})
                  </div>
                </div>
              );
            })}
          </div>
          <div>
            <h3>{t("eventDetail.past")}</h3>
            {data.occurrences.past.length === 0 && <div className="meta">{t("eventDetail.noPast")}</div>}
            {data.occurrences.past.map((item) => {
              const formatted = formatDateTimeRange(
                item.starts_at_utc,
                item.ends_at_utc,
                data.event.event_timezone,
                timeDisplayMode,
              );
              return (
                <div className="card" key={item.id}>
                  <div className="meta">
                    {formatted.primary} ({formatted.suffixLabel === "event"
                      ? t("common.eventTimezone")
                      : t("common.yourTimezone")})
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {data.event.attendance_mode !== "online" && hasGeo && (
        <div>
          <h3>{t("eventDetail.openMap")}</h3>
          <EventDetailMap lat={mapLat} lng={mapLng} />
        </div>
      )}

      {(hosts.length > 0 || externalUrl) && (
        <>
          <h3>{t("eventDetail.hosts")}</h3>
          {hosts.length > 0 ? (
            hosts.map((host) => (
              <div className="card" key={host.id}>
                <div className="event-host-row">
                  {host.avatarPath && <img className="event-host-avatar" src={host.avatarPath} alt={host.name} loading="lazy" />}
                  <div>
                    <Link href={`/hosts/${host.slug}`}>{host.name}</Link>
                    {host.roles.length > 0 && <div className="meta">{host.roles.join(", ")}</div>}
                  </div>
                </div>
              </div>
            ))
          ) : externalUrl ? (
            <div className="card">
              <a className="secondary-btn" href={externalUrl} target="_blank" rel="noreferrer">
                {t("eventDetail.externalLink")}
              </a>
            </div>
          ) : null}
        </>
      )}

      {externalUrl && hosts.length > 0 && (
        <div>
          <a className="secondary-btn" href={externalUrl} target="_blank" rel="noreferrer">
            {t("eventDetail.externalLink")}
          </a>
        </div>
      )}

      <footer className="cards">
        <div className="meta">{t("eventDetail.metadata.languages")}</div>
        <div className="kv">
          {data.event.languages.map((item) => (
            <span className="tag" key={item}>
              {getLanguageLabel(item)}
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

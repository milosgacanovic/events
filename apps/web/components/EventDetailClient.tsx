"use client";

import DOMPurify from "dompurify";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchJson } from "../lib/api";
import { formatDateTimeRange, type TimeDisplayMode } from "../lib/datetime";
import { labelForLanguageCode } from "../lib/i18n/languageLabels";
import { formatTimeZone, getUserTimeZone, readTimeDisplayMode, writeTimeDisplayMode } from "../lib/timeDisplay";
import { useKeycloakAuth } from "./auth/KeycloakAuthProvider";
import { useI18n } from "./i18n/I18nProvider";
import { pushDataLayer } from "../lib/gtm";

const SHORTENER_BLOCKLIST = new Set([
  "bit.ly", "tinyurl.com", "t.co", "lnkd.in", "linktr.ee",
  "rebrand.ly", "ow.ly", "buff.ly", "short.io", "cutt.ly",
]);

function getBookingDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return SHORTENER_BLOCKLIST.has(hostname) ? null : hostname;
  } catch {
    return null;
  }
}

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
    tags: string[];
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

  let trimmed = html.trim();
  // Fix double-encoded entities from importer bug (e.g. &lt;br&gt; → <br>)
  if (trimmed.includes("&lt;")) {
    trimmed = trimmed
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }
  // Strip "DESCRIPTION " field-label artifact injected by some scrapers
  trimmed = trimmed.replace(/^((?:<[^>]+>)*)\s*DESCRIPTION\s+/i, "$1");
  return trimmed || null;
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateForGoogle(utcString: string): string {
  return new Date(utcString).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
}

function formatDateForIcs(utcString: string, timezone: string): string {
  const date = new Date(utcString);
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}${get("month")}${get("day")}T${hour}${get("minute")}${get("second")}`;
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildIcsContent(params: {
  title: string;
  startUtc: string;
  endUtc: string;
  timezone: string;
  location: string;
  description: string;
  url: string;
  uid: string;
}): string {
  const dtstart = formatDateForIcs(params.startUtc, params.timezone);
  const dtend = formatDateForIcs(params.endUtc, params.timezone);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DanceResource//Events//EN",
    "BEGIN:VEVENT",
    `UID:${params.uid}@danceresource.org`,
    `DTSTART;TZID=${params.timezone}:${dtstart}`,
    `DTEND;TZID=${params.timezone}:${dtend}`,
    `SUMMARY:${escapeIcsText(params.title)}`,
    `LOCATION:${escapeIcsText(params.location)}`,
    `DESCRIPTION:${escapeIcsText(params.description)}`,
    `URL:${params.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

function downloadIcs(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const URL_REGEX = /https?:\/\/[^\s<>"']+[^\s<>"'.,!?)]/g;
function getRoleLabel(key: string, t: (k: string) => string): string {
  const translated = t(`roleType.${key}`);
  return translated === `roleType.${key}` ? key : translated;
}

function linkifyHtml(html: string): string {
  return html.replace(/(<a[\s\S]*?<\/a>)|([^<]+)/g, (match, anchor, text) => {
    if (anchor) return anchor;
    if (text) return text.replace(URL_REGEX, (url: string) => `<a href="${url}" target="_blank" rel="noreferrer noopener">${url}</a>`);
    return match;
  });
}

function getFormatLabel(key: string, label: string, t: (k: string) => string): string {
  const translated = t(`eventFormat.${key}`);
  return translated === `eventFormat.${key}` ? label : translated;
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
  const router = useRouter();
  const auth = useKeycloakAuth();
  const [cameFromSearch] = useState(() => {
    try { return !!sessionStorage.getItem("search-cache-snapshot"); } catch { return false; }
  });
  const [data, setData] = useState<EventDetail | null>(initialData ?? null);
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(initialTaxonomy ?? null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [timeDisplayMode, setTimeDisplayMode] = useState<TimeDisplayMode>("user");
  const [descExpanded, setDescExpanded] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const calRef = useRef<HTMLDivElement>(null);
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
      const role = getRoleLabel(row.role_key, t) || row.role_label || row.role_key;
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

  const categorySingularLabel = t("admin.placeholder.categorySingular");

  const categoryById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of taxonomy?.practices.categories ?? []) {
      map.set(category.id, category.label);
    }
    return map;
  }, [taxonomy]);

  const categoryKeyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of taxonomy?.practices.categories ?? []) {
      if (category.key) map.set(category.id, category.key);
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
  const eventFormatKeyById = useMemo(() => {
    const map = new Map<string, string>();
    for (const format of taxonomy?.eventFormats ?? []) {
      map.set(format.id, format.key);
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
  const sanitizedDescriptionHtml = useMemo(() => {
    if (!rawDescriptionHtml) return null;
    if (typeof window === "undefined") return rawDescriptionHtml; // SSR: skip sanitize, client re-renders
    return linkifyHtml(DOMPurify.sanitize(rawDescriptionHtml));
  }, [rawDescriptionHtml]);
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

  const calDescriptionBody = useMemo(() => {
    if (!sanitizedDescriptionHtml) return "";
    const text = stripHtml(sanitizedDescriptionHtml);
    if (text.length <= 200) return text;
    // Forward search: find first sentence end at or after 200 chars, within 300
    const sentenceEnd = /[.!?](?:\s|$)/g;
    let breakAt = -1;
    let m;
    while ((m = sentenceEnd.exec(text)) !== null) {
      const pos = m.index + 1; // include punctuation, exclude trailing space
      if (pos >= 200 && pos <= 300) { breakAt = pos; break; }
      if (m.index >= 300) break;
    }
    // Fallback: last sentence end before 300
    if (breakAt === -1) {
      const slice = text.slice(0, 300);
      const last = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
      breakAt = last > 0 ? last + 1 : Math.min(text.length, 300);
    }
    return text.slice(0, breakAt).trimEnd();
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

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  useEffect(() => {
    if (!data) return;
    const firstUpcoming = data.occurrences?.upcoming?.[0];
    const eventDate =
      firstUpcoming?.starts_at_utc?.slice(0, 10) ??
      data.event.single_start_at?.slice(0, 10) ??
      null;
    const catLabel =
      taxonomy?.practices.categories.find(
        (c) => c.id === data.event.practice_category_id,
      )?.label ?? null;
    const location =
      data.defaultLocation?.city ??
      (data.event.attendance_mode === "online" ? "online" : null);
    pushDataLayer({
      event: "event_detail_view",
      page_type: "event_detail",
      event_title: data.event.title,
      event_date: eventDate,
      event_category: catLabel,
      event_location: location,
      event_attendance_mode: data.event.attendance_mode,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.event.id]);

  const handleCopyLink = useCallback(async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    pushDataLayer({ event: "event_share", event_title: data?.event.title ?? null, share_method: "copy_link" });
  }, [data?.event.title]);

  const handleNativeShare = useCallback(() => {
    navigator.share({ title: document.title, url: window.location.href }).catch(() => {});
    pushDataLayer({ event: "event_share", event_title: data?.event.title ?? null, share_method: "native" });
  }, [data?.event.title]);

  useEffect(() => {
    if (!calOpen) return;
    function handleClick(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) {
        setCalOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [calOpen]);

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
    ? (() => {
        const key = eventFormatKeyById.get(data.event.event_format_id!);
        const label = eventFormatById.get(data.event.event_format_id!) ?? data.event.event_format_id!;
        return key ? getFormatLabel(key, label, t) : label;
      })()
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
  const lastSyncedUtc = new Date(lastSyncedRaw).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const mapLat = data.defaultLocation?.lat ?? data.occurrences.upcoming[0]?.lat ?? null;
  const mapLng = data.defaultLocation?.lng ?? data.occurrences.upcoming[0]?.lng ?? null;
  const hasGeo = mapLat !== null && mapLng !== null;
  const isLongDesc = (sanitizedDescriptionHtml?.length ?? 0) > 800;

  const calEventTitle = data?.event.title ?? "";
  const calStartUtc = data?.event.single_start_at ?? null;
  const calEndUtc = data?.event.single_end_at ?? null;
  const calTimezone = data?.event.event_timezone ?? "UTC";
  const calLocation = data?.defaultLocation
    ? [data.defaultLocation.city, data.defaultLocation.country_code ? getCountryLabel(data.defaultLocation.country_code) : null].filter(Boolean).join(", ")
    : "";
  const calUrl = typeof window !== "undefined" ? window.location.href : `https://events.danceresource.org/events/${data?.event.id ?? ""}`;
  const calGoogleDetails = calDescriptionBody ? `${calUrl}\n\n${calDescriptionBody}` : calUrl;
  const calUid = data?.event.id ?? "";

  function handleGoogleCalendar() {
    if (!calStartUtc || !calEndUtc) return;
    const start = formatDateForGoogle(calStartUtc);
    const end = formatDateForGoogle(calEndUtc);
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calEventTitle)}&dates=${start}/${end}&location=${encodeURIComponent(calLocation)}&details=${encodeURIComponent(calGoogleDetails)}`;
    window.open(url, "_blank", "noreferrer");
    setCalOpen(false);
  }

  function handleDownloadIcs() {
    if (!calStartUtc || !calEndUtc) return;
    const content = buildIcsContent({
      title: calEventTitle,
      startUtc: calStartUtc,
      endUtc: calEndUtc,
      timezone: calTimezone,
      location: calLocation,
      description: calDescriptionBody,
      url: calUrl,
      uid: calUid,
    });
    const filename = calEventTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase().slice(0, 40) + ".ics";
    downloadIcs(content, filename);
    setCalOpen(false);
  }

  return (
    <article className="event-detail panel">
      {/* Breadcrumb */}
      <nav className="event-detail-breadcrumb">
        {cameFromSearch ? (
          <a
            href="/events"
            onClick={(e) => { e.preventDefault(); router.back(); }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4 }}><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {t("nav.events")}
          </a>
        ) : (
          <Link href="/events">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 4 }}><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {t("nav.events")}
          </Link>
        )}
        <div className="breadcrumb-share">
          {canNativeShare ? (
            <button type="button" className="breadcrumb-share-btn" onClick={handleNativeShare}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1v8M3.5 4.5L7 1l3.5 3.5M2 10v2.5h10V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {t("eventDetail.shareNative")}
            </button>
          ) : (
            <>
              <a className="breadcrumb-share-btn" href={`https://x.com/intent/post?url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}&text=${encodeURIComponent(typeof document !== "undefined" ? document.title : "")}`} target="_blank" rel="noopener noreferrer" onClick={() => pushDataLayer({ event: "event_share", event_title: data?.event.title ?? null, share_method: "twitter" })}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 1l5.2 6.6L1 13h1.6l4.4-5.1L11 13h2.5L8 6.1 13 1h-1.6L7.4 5.7 3.5 1H1Z" fill="currentColor"/></svg>
                X
              </a>
              <a className="breadcrumb-share-btn" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`} target="_blank" rel="noopener noreferrer" onClick={() => pushDataLayer({ event: "event_share", event_title: data?.event.title ?? null, share_method: "facebook" })}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M9.5 1H8a3 3 0 0 0-3 3v1.5H3.5V8H5v5.5h2.5V8H9l.5-2.5H7.5V4a.5.5 0 0 1 .5-.5H9.5V1Z" fill="currentColor"/></svg>
                Facebook
              </a>
              <a className="breadcrumb-share-btn" href={`https://wa.me/?text=${encodeURIComponent(typeof document !== "undefined" ? document.title : "")}%20${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`} target="_blank" rel="noopener noreferrer" onClick={() => pushDataLayer({ event: "event_share", event_title: data?.event.title ?? null, share_method: "whatsapp" })}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1a6 6 0 0 1 5.196 9L13 13l-3.13-.824A6 6 0 1 1 7 1Z" stroke="currentColor" strokeWidth="1.3"/><path d="M5 5.5c.5 1 1.5 2.5 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                WhatsApp
              </a>
              <button type="button" className="breadcrumb-share-btn" onClick={handleCopyLink}>
                {copied ? (
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7l3.5 3.5L12 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="4" y="4" width="8" height="9" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                )}
                {copied ? t("eventDetail.shareCopied") : t("eventDetail.shareCopy")}
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Header */}
      <div className="event-detail-header">
        <h1 className="event-detail-title">{data.event.title}</h1>
        {canEdit && (
          <Link className="secondary-btn" href={`/admin?section=events&id=${encodeURIComponent(data.event.id)}`}>
            {t("eventDetail.editEvent")}
          </Link>
        )}
      </div>

      {/* Cover image */}
      {coverImageUrl && (
        <img
          className="event-detail-cover"
          src={coverImageUrl}
          alt={data.event.title}
          loading="eager"
          decoding="async"
        />
      )}

      {/* Book / register CTA */}
      {externalUrl ? (
        <a className="primary-btn event-detail-cta" href={externalUrl} target="_blank" rel="noreferrer" onClick={() => pushDataLayer({ event: "register_click", event_title: data.event.title, funnel_step: 1 })}>
          {(() => {
            const domain = getBookingDomain(externalUrl);
            return domain ? t("eventDetail.externalLinkOn", { domain }) : t("eventDetail.externalLink");
          })()}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ verticalAlign: "middle", marginLeft: 6 }}><path d="M3 11L11 3M11 3H5.5M11 3v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </a>
      ) : (
        <p className="event-detail-no-booking">{t("eventDetail.noExternalLink")}</p>
      )}

      {/* Metadata grid */}
      <div className="event-detail-meta-grid">
        {data.event.schedule_kind === "single" && whenFormatted && (
          <div className="event-detail-meta-item">
            <span className="event-detail-meta-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {t("eventDetail.when")}
              <span className="cal-wrap" ref={calRef}>
                <button
                  type="button"
                  className="cal-trigger"
                  onClick={() => setCalOpen((v) => !v)}
                  aria-label={t("eventDetail.addToCalendar")}
                  aria-expanded={calOpen}
                >
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ verticalAlign: "middle", marginRight: 3 }}>
                    <rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M1 6h12" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M4 1v2M10 1v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  {t("eventDetail.addToCalendar")}
                </button>
                {calOpen && (
                  <div className="cal-dropdown" role="menu">
                    <button type="button" role="menuitem" onClick={handleGoogleCalendar}>Google Calendar</button>
                    <button type="button" role="menuitem" onClick={handleDownloadIcs}>Apple Calendar (.ics)</button>
                    <button type="button" role="menuitem" onClick={handleDownloadIcs}>Outlook (.ics)</button>
                  </div>
                )}
              </span>
            </span>
            <span className="event-detail-meta-value">
              {whenLabel}
            </span>
            <label className="toggle-control toggle-control-sm" style={{ marginTop: 6 }}>
              <input
                className="toggle-control-input"
                type="checkbox"
                checked={timeDisplayMode === "event"}
                onChange={(event) => setTimeDisplayMode(event.target.checked ? "event" : "user")}
              />
              <span className="toggle-control-track" aria-hidden />
              <span className="meta" suppressHydrationWarning>
                {timeDisplayMode === "event" ? (
                  <>
                    {t("eventDetail.timeMode.event")}{" "}
                    {(() => {
                      const tz = data.event.event_timezone;
                      const unknown = !tz || tz === "UTC";
                      return unknown ? (
                        <span style={{ opacity: 0.6 }}>
                          (<span style={{ color: "var(--warning-ink)" }}>{t("common.timezoneUnknown")}</span>)
                        </span>
                      ) : (
                        <span style={{ opacity: 0.6 }}>({formatTimeZone(tz)})</span>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    {t("eventDetail.timeMode.user")}{" "}
                    <span style={{ opacity: 0.6 }}>({formatTimeZone(userTimeZone)})</span>
                  </>
                )}
              </span>
            </label>
          </div>
        )}
        <div className="event-detail-meta-item">
          <span className="event-detail-meta-label">{t("eventDetail.where")}</span>
          {data.event.attendance_mode === "online" ? (
            <span className="event-detail-meta-value">{modalityLabel}</span>
          ) : (
            <>
              <span className="event-detail-meta-value">
                {data.defaultLocation?.city && data.defaultLocation?.country_code ? (
                  <Link href={`/events?city=${encodeURIComponent(data.defaultLocation.city.toLowerCase())}&countryCode=${data.defaultLocation.country_code}`} style={{ color: "inherit", textDecoration: "none" }}>{data.defaultLocation.city}</Link>
                ) : (
                  data.defaultLocation?.city ?? data.defaultLocation?.formatted_address ?? t("eventDetail.locationTbd")
                )}
              </span>
              {data.defaultLocation?.country_code && (
                <span className="event-detail-meta-value" style={{ color: "var(--muted)" }}>
                  <Link href={`/events?countryCode=${data.defaultLocation.country_code}`} style={{ color: "inherit", textDecoration: "none" }}>{getCountryLabel(data.defaultLocation.country_code)}</Link>
                </span>
              )}
            </>
          )}
        </div>
        {hosts.length > 0 && (
          <div className="event-detail-meta-item">
            <span className="event-detail-meta-label">
              {hosts.length === 1 ? t("eventDetail.host") : t("eventDetail.hosts")}
            </span>
            <span className="event-detail-meta-value">
              {hosts.map((host, i) => (
                <span key={host.id}>
                  {i > 0 && ", "}
                  <Link href={`/hosts/${host.slug}`}>{host.name}</Link>
                </span>
              ))}
            </span>
          </div>
        )}
        <div className="event-detail-meta-item">
          <span className="event-detail-meta-label">{categorySingularLabel}</span>
          <span className="event-detail-meta-value">
            <Link href={categoryKeyById.get(data.event.practice_category_id) ? `/events?practice=${categoryKeyById.get(data.event.practice_category_id)}` : `/events?practiceCategoryId=${data.event.practice_category_id}`}>{categoryLabel}</Link>
            {data.event.practice_subcategory_id
              ? ` / ${subcategoryById.get(data.event.practice_subcategory_id) ?? data.event.practice_subcategory_id}`
              : ""}
          </span>
        </div>
        {eventFormatLabel && (
          <div className="event-detail-meta-item">
            <span className="event-detail-meta-label">{t("eventSearch.eventFormat")}</span>
            <span className="event-detail-meta-value"><Link href={`/events?eventFormatId=${data.event.event_format_id}`}>{eventFormatLabel}</Link></span>
          </div>
        )}
        <div className="event-detail-meta-item">
          <span className="event-detail-meta-label">{t("eventDetail.attendance")}</span>
          <span className="event-detail-meta-value">
            <Link href={`/events?attendanceMode=${data.event.attendance_mode}`}>{modalityLabel}</Link>
          </span>
        </div>
        {data.event.languages.length > 0 && (
          <div className="event-detail-meta-item">
            <span className="event-detail-meta-label">{data.event.languages.length === 1 ? t("eventDetail.metadata.language") : t("eventDetail.metadata.languages")}</span>
            <span className="event-detail-meta-value">
              {data.event.languages.map((l, i) => (
                <span key={l}>{i > 0 && ", "}<Link href={`/events?languages=${l}`}>{getLanguageLabel(l)}</Link></span>
              ))}
            </span>
          </div>
        )}
        {(data.event.tags?.length ?? 0) > 0 && (
          <div className="event-detail-meta-item">
            <span className="event-detail-meta-label">{t("organizerDetail.tags")}</span>
            <span className="event-detail-meta-value">
              {data.event.tags.map((tag, i) => (
                <span key={tag}>{i > 0 && " · "}<Link href={`/events?tags=${encodeURIComponent(tag)}`}>{tag}</Link></span>
              ))}
            </span>
          </div>
        )}
      </div>

      {/* Timezone toggle for recurring events (no When cell in grid) */}
      {data.event.schedule_kind !== "single" && (
        <label className="toggle-control toggle-control-sm">
          <input
            className="toggle-control-input"
            type="checkbox"
            checked={timeDisplayMode === "event"}
            onChange={(event) => setTimeDisplayMode(event.target.checked ? "event" : "user")}
          />
          <span className="toggle-control-track" aria-hidden />
          <span className="meta" suppressHydrationWarning>
            {timeDisplayMode === "event" ? (
              <>
                {t("eventDetail.timeMode.event")}{" "}
                {(() => {
                  const tz = data.event.event_timezone;
                  const unknown = !tz || tz === "UTC";
                  return unknown ? (
                    <span style={{ opacity: 0.6 }}>
                      (<span style={{ color: "var(--warning-ink)" }}>{t("common.timezoneUnknown")}</span>)
                    </span>
                  ) : (
                    <span style={{ opacity: 0.6 }}>({formatTimeZone(tz)})</span>
                  );
                })()}
              </>
            ) : (
              <>
                {t("eventDetail.timeMode.user")}{" "}
                <span style={{ opacity: 0.6 }}>({formatTimeZone(userTimeZone)})</span>
              </>
            )}
          </span>
        </label>
      )}

      {/* Description */}
      {sanitizedDescriptionHtml && (
        <div className="event-detail-section">
          <h2 className="event-detail-section-title">{t("eventDetail.descriptionLabel")}</h2>
          <div
            className={isLongDesc && !descExpanded ? "event-detail-desc" : "event-detail-desc expanded"}
            dangerouslySetInnerHTML={{ __html: sanitizedDescriptionHtml }}
          />
          {isLongDesc && (
            <button
              type="button"
              className="event-detail-expand-btn"
              onClick={() => setDescExpanded((v) => !v)}
              aria-expanded={descExpanded}
            >
              {descExpanded ? t("eventDetail.readLess") : t("eventDetail.readMore")}
            </button>
          )}
        </div>
      )}


      {/* Hosts */}
      {hosts.length > 0 && (
        <div className="event-detail-section">
          <h2 className="event-detail-section-title">{hosts.length === 1 ? t("eventDetail.host") : t("eventDetail.hosts")}</h2>
          <div className="event-hosts-grid">
            {hosts.map((host) => (
              <Link className="card event-host-card" key={host.id} href={`/hosts/${host.slug}`}>
                <div
                  className="event-host-avatar"
                  style={{ background: host.avatarPath ? undefined : "var(--surface-skeleton)" }}
                >
                  {host.avatarPath ? (
                    <img src={host.avatarPath} alt={host.name} loading="lazy" decoding="async" />
                  ) : (
                    <span className="host-card-avatar-initials" aria-hidden>
                      {host.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("")}
                    </span>
                  )}
                </div>
                <div className="event-host-body">
                  <div className="event-host-name">{host.name}</div>
                  {host.roles.length > 0 && (
                    <div className="meta">{host.roles.join(" · ")}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Schedule (recurring events only) */}
      {data.event.schedule_kind !== "single" && (
        <>
          <div className="event-detail-section">
            <h2 className="event-detail-section-title">{t("eventDetail.upcoming")}</h2>
            {data.occurrences.upcoming.length === 0 ? (
              <div className="meta">{t("eventDetail.noUpcoming")}</div>
            ) : (
              <div className="event-detail-occurrences">
                {data.occurrences.upcoming.map((item) => {
                  const formatted = formatDateTimeRange(
                    item.starts_at_utc, item.ends_at_utc, data.event.event_timezone, timeDisplayMode,
                  );
                  return (
                    <div className="event-detail-occurrence" key={item.id}>
                      <span className="meta">{formatted.primary}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="event-detail-section">
            <h2 className="event-detail-section-title">{t("eventDetail.past")}</h2>
            {data.occurrences.past.length === 0 ? (
              <div className="meta">{t("eventDetail.noPast")}</div>
            ) : (
              <div className="event-detail-occurrences">
                {data.occurrences.past.map((item) => {
                  const formatted = formatDateTimeRange(
                    item.starts_at_utc, item.ends_at_utc, data.event.event_timezone, timeDisplayMode,
                  );
                  return (
                    <div className="event-detail-occurrence" key={item.id}>
                      <span className="meta">{formatted.primary}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Map */}
      {data.event.attendance_mode !== "online" && hasGeo && (
        <div className="event-detail-section">
          <h2 className="event-detail-section-title">{t("eventDetail.openMap")}</h2>
          <EventDetailMap lat={mapLat} lng={mapLng} />
        </div>
      )}

      {/* Footer */}
      <footer className="event-detail-footer">
        {isImported && externalUrl && (
          <div className="event-detail-disclaimer">
            <div>{t("eventDetail.import.sharedWithCare")}</div>
            <div>{t("eventDetail.import.sourceLine")}</div>
            <div>
              {t("eventDetail.import.officialLink")}{" "}
              <a href={externalUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{externalUrl}</a>
            </div>
            <div>{t("eventDetail.import.lastSynced", { value: lastSyncedUtc })}</div>
            <div>
              {t("eventDetail.import.contactPrefix")}{" "}
              <a href="mailto:hello@danceresource.org" style={{ color: "var(--accent)" }}>hello@danceresource.org</a>
            </div>
          </div>
        )}
      </footer>
    </article>
  );
}

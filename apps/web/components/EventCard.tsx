"use client";

import Link from "next/link";

import { isSeriesGroupingEnabled } from "../lib/features";
import { formatDateTimeRange, type TimeDisplayMode } from "../lib/datetime";
import { useI18n } from "./i18n/I18nProvider";
import { SaveEventButton } from "./SaveEventButton";

export type EventCardHit = {
  occurrenceId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  event: {
    id: string;
    slug: string;
    title: string;
    coverImageUrl?: string | null;
    attendanceMode: string;
    eventTimezone?: string | null;
    languages: string[];
    tags: string[];
    practiceCategoryId: string | null;
    scheduleKind?: string;
    siblingCount?: number | null;
  };
  location?: {
    formatted_address?: string | null;
    city?: string | null;
    country_code?: string | null;
  } | null;
  organizers?: Array<{ id: string; name: string; slug?: string }>;
};

export type EventCardProps = {
  hit: EventCardHit;
  categoryKeyById: Map<string, string>;
  categoryLabelById: Map<string, string>;
  getLanguageLabel: (lang: string) => string;
  getCountryLabel: (cc: string) => string;
  tagDisplay: (tag: string) => string;
  hideOrganizers?: boolean;
  timeDisplayMode?: TimeDisplayMode;
  onClick?: () => void;
};

export function EventCard({
  hit,
  categoryKeyById,
  categoryLabelById,
  getLanguageLabel,
  getCountryLabel,
  tagDisplay,
  hideOrganizers,
  timeDisplayMode = "event",
  onClick,
}: EventCardProps) {
  const { t } = useI18n();

  const formatted = formatDateTimeRange(
    hit.startsAtUtc,
    hit.endsAtUtc,
    hit.event.eventTimezone ?? "UTC",
    timeDisplayMode,
  );

  const catKey = categoryKeyById.get(hit.event.practiceCategoryId ?? "") ?? "other";
  const catLabel = hit.event.practiceCategoryId
    ? categoryLabelById.get(hit.event.practiceCategoryId)
    : undefined;

  const locationParts = (() => {
    if (hit.location?.city || hit.location?.country_code) {
      return [
        hit.location?.city ?? "",
        hit.location?.country_code ? getCountryLabel(hit.location.country_code) : "",
      ].filter(Boolean).join(", ");
    }
    if (hit.event.attendanceMode === "online") return t("eventSearch.locationOnline");
    return t("eventSearch.locationTbd");
  })();

  const organizerNames = hideOrganizers
    ? null
    : hit.organizers?.map((o) => o.name).join(", ");

  const visiblePills = [
    ...hit.event.languages.map((l) => getLanguageLabel(l)),
    ...hit.event.tags.map((tag) => tagDisplay(tag)),
  ];

  const isRecurring =
    hit.event.scheduleKind === "recurring" || (hit.event.siblingCount ?? 1) > 1;

  const occurrenceDate = isSeriesGroupingEnabled()
    ? null
    : hit.startsAtUtc?.slice(0, 10) ?? null;

  const href =
    occurrenceDate && !isRecurring
      ? `/events/${hit.event.slug}?date=${occurrenceDate}`
      : `/events/${hit.event.slug}`;

  return (
    <Link className="card event-card-h" href={href} onClick={onClick}>
      <div className="event-card-main">
        <div
          className="event-card-thumb-h"
          style={{
            background: hit.event.coverImageUrl
              ? undefined
              : `var(--category-${catKey}, var(--surface-skeleton))`,
          }}
        >
          <SaveEventButton eventId={hit.event.id} compact />
          {hit.event.coverImageUrl ? (
            <img
              className="event-card-thumb"
              src={hit.event.coverImageUrl}
              alt={hit.event.title}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const img = e.currentTarget;
                img.onerror = null;
                img.src = "/logo.jpg";
                img.className = "event-card-fallback-logo";
              }}
            />
          ) : (
            <img className="event-card-fallback-logo" src="/logo.jpg" alt="" aria-hidden />
          )}
        </div>
        <div className="event-card-body">
          <h3>{hit.event.title}</h3>
          <div
            className="meta"
            title={formatted.suffixLabel === "event" ? t("common.eventTimezone") : t("common.yourTimezone")}
            suppressHydrationWarning
          >
            {formatted.primary}
            {isRecurring && ` · ${t("eventDetail.recurringChip")}`}
            {" · "}
            {t(`attendanceMode.${hit.event.attendanceMode}`)}
          </div>
          {locationParts && <div className="meta">{locationParts}</div>}
          {organizerNames && <div className="meta">{organizerNames}</div>}
        </div>
      </div>
      {(catLabel || visiblePills.length > 0) && (
        <div className="kv event-card-pills">
          {catLabel && <span className="tag tag-practice">{catLabel}</span>}
          {visiblePills.map((pill, i) => (
            <span className="tag" key={i}>{pill}</span>
          ))}
        </div>
      )}
    </Link>
  );
}

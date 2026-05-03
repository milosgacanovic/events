"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { formatPointDateTime } from "../lib/datetime";
import { useI18n } from "./i18n/I18nProvider";

const HOVER_OPEN_DELAY_MS = 120;
const HOVER_CLOSE_DELAY_MS = 200;
const CARD_VERTICAL_OFFSET = 14;
const CARD_HORIZONTAL_PADDING = 8;
const CARD_DEFAULT_WIDTH = 380;
const CARD_DEFAULT_HEIGHT = 144;
const CACHE_MAX_ENTRIES = 200;

export type EventCardData = {
  occurrenceId: string;
  eventId: string;
  eventSlug: string;
  title: string;
  startsAtUtc: string;
  endsAtUtc: string | null;
  timezone: string | null;
  coverImageUrl: string | null;
  city: string | null;
  countryCode: string | null;
  practiceLabel: string | null;
  tags: string[];
  organizer: { id: string; slug: string; name: string } | null;
};

export type OrganizerCardData = {
  organizerId: string;
  organizerSlug: string;
  organizerName: string;
  avatarUrl: string | null;
  practiceLabels: string[];
  city: string | null;
  upcomingEventCount: number;
  nextEventStartsAtUtc: string | null;
  nextEventTimezone: string | null;
};

type LRUCache<V> = {
  get: (key: string) => V | undefined;
  set: (key: string, value: V) => void;
};

function createLruCache<V>(max: number): LRUCache<V> {
  const map = new Map<string, V>();
  return {
    get(key) {
      const value = map.get(key);
      if (value === undefined) return undefined;
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key, value) {
      if (map.has(key)) {
        map.delete(key);
      } else if (map.size >= max) {
        const first = map.keys().next().value;
        if (first !== undefined) map.delete(first);
      }
      map.set(key, value);
    },
  };
}

const eventCardCache = createLruCache<EventCardData>(CACHE_MAX_ENTRIES);
const organizerCardCache = createLruCache<OrganizerCardData>(CACHE_MAX_ENTRIES);

export function getEventCardCached(seriesId: string): EventCardData | undefined {
  return eventCardCache.get(seriesId);
}

export function getOrganizerCardCached(organizerId: string): OrganizerCardData | undefined {
  return organizerCardCache.get(organizerId);
}

export async function fetchEventCard(seriesId: string, signal?: AbortSignal): Promise<EventCardData | null> {
  const cached = eventCardCache.get(seriesId);
  if (cached) return cached;
  const res = await fetch(`/api/map/event-card?seriesId=${encodeURIComponent(seriesId)}`, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as EventCardData;
  eventCardCache.set(seriesId, data);
  return data;
}

export async function fetchOrganizerCard(organizerId: string, signal?: AbortSignal): Promise<OrganizerCardData | null> {
  const cached = organizerCardCache.get(organizerId);
  if (cached) return cached;
  const res = await fetch(`/api/map/organizer-card?organizerId=${encodeURIComponent(organizerId)}`, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as OrganizerCardData;
  organizerCardCache.set(organizerId, data);
  return data;
}

export type HoverIntent = {
  cancel: () => void;
  flush: () => void;
};

export function createHoverIntent(onOpen: () => void, delay = HOVER_OPEN_DELAY_MS): HoverIntent {
  const timer = window.setTimeout(onOpen, delay);
  return {
    cancel: () => window.clearTimeout(timer),
    flush: () => {
      window.clearTimeout(timer);
      onOpen();
    },
  };
}

export type HoverCardAnchor = {
  x: number;
  y: number;
  markerRadius: number;
};

type CommonProps = {
  anchor: HoverCardAnchor;
  containerWidth: number;
  containerHeight: number;
  href: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onNavigate?: () => void;
};

type EventInstantData = {
  title: string;
  startsAtUtc: string;
  timezone: string | null;
};

type HostInstantData = {
  organizerName: string;
  practiceLabels: string[];
};

export function MapHoverCard(
  props:
    | (CommonProps & { kind: "event"; instant: EventInstantData; data: EventCardData | null; loading: boolean })
    | (CommonProps & { kind: "host"; instant: HostInstantData; data: OrganizerCardData | null; loading: boolean }),
) {
  const { t } = useI18n();
  const cardRef = useRef<HTMLAnchorElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number>(CARD_DEFAULT_HEIGHT);

  useLayoutEffect(() => {
    if (!cardRef.current) return;
    setMeasuredHeight(cardRef.current.offsetHeight);
  }, [props.data, props.loading, props.kind]);

  const position = useMemo(() => {
    const cardWidth = CARD_DEFAULT_WIDTH;
    const cardHeight = measuredHeight || CARD_DEFAULT_HEIGHT;
    const aboveTop = props.anchor.y - props.anchor.markerRadius - CARD_VERTICAL_OFFSET - cardHeight;
    const belowTop = props.anchor.y + props.anchor.markerRadius + CARD_VERTICAL_OFFSET;
    const flipBelow = aboveTop < CARD_HORIZONTAL_PADDING;
    const top = flipBelow ? belowTop : aboveTop;
    let left = props.anchor.x - cardWidth / 2;
    left = Math.max(CARD_HORIZONTAL_PADDING, Math.min(props.containerWidth - cardWidth - CARD_HORIZONTAL_PADDING, left));
    return { top, left, width: cardWidth, flipBelow };
  }, [props.anchor, props.containerWidth, measuredHeight]);

  const eventDate = (() => {
    if (props.kind !== "event") return "";
    const isoUtc = props.data?.startsAtUtc ?? props.instant.startsAtUtc;
    const tz = props.data?.timezone ?? props.instant.timezone ?? "UTC";
    if (!isoUtc) return "";
    return formatPointDateTime(isoUtc, tz, "event").primary;
  })();

  const hostNextDate = (() => {
    if (props.kind !== "host") return "";
    const iso = props.data?.nextEventStartsAtUtc;
    if (!iso) return "";
    const tz = props.data?.nextEventTimezone ?? "UTC";
    return formatPointDateTime(iso, tz, "event").primary;
  })();

  const eventLocation = props.kind === "event"
    ? [props.data?.city, props.data?.countryCode?.toUpperCase()].filter(Boolean).join(", ")
    : "";

  const eventChips = (() => {
    if (props.kind !== "event") return [] as string[];
    const chips: string[] = [];
    if (props.data?.practiceLabel) chips.push(props.data.practiceLabel);
    const firstTag = props.data?.tags?.[0];
    if (firstTag) chips.push(firstTag);
    return chips.slice(0, 2);
  })();

  return (
    <Link
      ref={cardRef}
      href={props.href}
      // Soft nav via router.push. Plain <a href> on iOS Safari resulted in
      // an extra history entry showing up between the map and the event/host
      // detail page (two backs needed to return to the map). Going through
      // Next.js's Link → router.push matches the desktop marker-click path
      // and avoids the iOS-specific quirk.
      className={`map-hover-card map-hover-card--${props.kind}${position.flipBelow ? " map-hover-card--below" : ""}`}
      style={{
        position: "absolute",
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
      }}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onFocus={props.onMouseEnter}
      onBlur={props.onMouseLeave}
      onClick={props.onNavigate}
    >
      {props.kind === "event" ? (
        <>
          {props.data?.coverImageUrl ? (
            <span className="map-hover-card__cover" style={{ backgroundImage: `url(${props.data.coverImageUrl})` }} />
          ) : (
            <span className="map-hover-card__cover map-hover-card__cover--placeholder" aria-hidden />
          )}
          <span className="map-hover-card__body">
            <span className="map-hover-card__title">{props.data?.title ?? props.instant.title}</span>
            {eventDate ? <span className="map-hover-card__meta">{eventDate}</span> : null}
            {props.data?.organizer ? (
              <span className="map-hover-card__meta map-hover-card__host">
                {t("map.hoverCard.hostedBy", { name: props.data.organizer.name })}
              </span>
            ) : null}
            {eventLocation ? <span className="map-hover-card__meta">{eventLocation}</span> : null}
            {eventChips.length > 0 ? (
              <span className="map-hover-card__chips">
                {eventChips.map((chip) => (
                  <span key={chip} className="map-hover-card__chip">{chip}</span>
                ))}
              </span>
            ) : null}
            {props.loading && !props.data ? (
              <span className="map-hover-card__skeleton" aria-hidden />
            ) : null}
          </span>
        </>
      ) : (
        <>
          {props.data?.avatarUrl ? (
            <span className="map-hover-card__avatar" style={{ backgroundImage: `url(${props.data.avatarUrl})` }} />
          ) : (
            <span className="map-hover-card__avatar map-hover-card__avatar--placeholder" aria-hidden>
              {(props.data?.organizerName ?? props.instant.organizerName).slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="map-hover-card__body">
            <span className="map-hover-card__title">{props.data?.organizerName ?? props.instant.organizerName}</span>
            {(() => {
              const labels = props.data?.practiceLabels ?? props.instant.practiceLabels;
              return labels.length > 0 ? (
                <span className="map-hover-card__meta">{labels.slice(0, 3).join(", ")}</span>
              ) : null;
            })()}
            {props.data?.city ? (
              <span className="map-hover-card__meta">{props.data.city}</span>
            ) : null}
            {props.data && props.data.upcomingEventCount > 0 ? (
              <span className="map-hover-card__meta">
                {t("map.hoverCard.upcomingEvents", { count: props.data.upcomingEventCount })}
              </span>
            ) : null}
            {hostNextDate ? (
              <span className="map-hover-card__meta">{t("map.hoverCard.nextEvent", { date: hostNextDate })}</span>
            ) : null}
          </span>
        </>
      )}
    </Link>
  );
}

export { HOVER_OPEN_DELAY_MS, HOVER_CLOSE_DELAY_MS };

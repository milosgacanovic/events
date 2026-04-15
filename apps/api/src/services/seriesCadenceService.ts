import { DateTime } from "luxon";

import type { EventSeriesRow } from "../types/domain";

/**
 * A human-facing cadence summary for an event series, e.g. "Wednesdays 9pm – 11pm".
 * Only weekly cadences are emitted in v1 — DAILY/MONTHLY/YEARLY return null and the
 * UI falls back to a "N upcoming dates" line.
 */
export type SeriesCadence = {
  kind: "weekly";
  /** Luxon weekday: 1=Monday … 7=Sunday */
  weekday: number;
  /** Zero-padded local start time, e.g. "21:00" */
  startLocalHHMM: string;
  /** Zero-padded local end time, e.g. "23:00" */
  endLocalHHMM: string;
  /** IANA zone the HH:MM values are in */
  timezone: string;
};

type CadenceEvent = Pick<
  EventSeriesRow,
  | "rrule"
  | "rrule_dtstart_local"
  | "duration_minutes"
  | "event_timezone"
  | "schedule_kind"
>;

type UpcomingOccurrence = {
  starts_at_utc: string;
  ends_at_utc: string;
};

const WEEKDAY_TOKEN_TO_LUXON: Record<string, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

function hhmm(dt: DateTime): string {
  return dt.toFormat("HH:mm");
}

/**
 * Parse rrule_dtstart_local, which may be a Date (pg result) or an ISO string (tests).
 */
function parseDtstartLocal(value: unknown, zone: string): DateTime | null {
  if (value instanceof Date) {
    return DateTime.fromJSDate(value, { zone });
  }
  if (typeof value === "string") {
    const dt = DateTime.fromISO(value, { zone });
    if (dt.isValid) return dt;
  }
  return null;
}

/**
 * Try to extract a weekly cadence from a native rrule.
 *
 * Returns null unless:
 *  - schedule_kind === "recurring"
 *  - FREQ=WEEKLY
 *  - exactly one BYDAY weekday token (e.g. BYDAY=WE)
 *  - duration_minutes is set
 *  - we have a local anchor (rrule_dtstart_local OR first upcoming occurrence)
 */
function fromRrule(event: CadenceEvent, anchorStartsAtUtc: string | null): SeriesCadence | null {
  if (event.schedule_kind !== "recurring" || !event.rrule || !event.duration_minutes) return null;

  const freqMatch = event.rrule.match(/FREQ=(\w+)/i);
  if (!freqMatch || freqMatch[1].toUpperCase() !== "WEEKLY") return null;

  const bydayMatch = event.rrule.match(/BYDAY=([A-Z,]+)/i);
  if (!bydayMatch) return null;
  const days = bydayMatch[1]
    .split(",")
    .map((d) => d.trim().toUpperCase())
    .filter(Boolean);
  if (days.length !== 1) return null;
  const weekday = WEEKDAY_TOKEN_TO_LUXON[days[0]];
  if (!weekday) return null;

  const zone = event.event_timezone;
  let startLocal = parseDtstartLocal(event.rrule_dtstart_local, zone);
  if (!startLocal && anchorStartsAtUtc) {
    const utc = DateTime.fromISO(anchorStartsAtUtc, { zone: "utc" });
    if (utc.isValid) startLocal = utc.setZone(zone);
  }
  if (!startLocal || !startLocal.isValid) return null;

  const endLocal = startLocal.plus({ minutes: event.duration_minutes });

  return {
    kind: "weekly",
    weekday,
    startLocalHHMM: hhmm(startLocal),
    endLocalHHMM: hhmm(endLocal),
    timezone: zone,
  };
}

/**
 * Infer a weekly cadence from a set of upcoming occurrences. Returns null
 * unless at least 2 upcoming rows exist AND every row shares the same local
 * weekday + start HH:MM + end HH:MM (in the event's timezone).
 *
 * Keeps us honest: if even one sibling was rescheduled to a different day/time,
 * we fall back to the count-only line instead of lying.
 */
function fromUpcoming(event: CadenceEvent, upcoming: UpcomingOccurrence[]): SeriesCadence | null {
  if (upcoming.length < 2) return null;
  const zone = event.event_timezone;

  let weekday: number | null = null;
  let startHHMM: string | null = null;
  let endHHMM: string | null = null;

  for (const occ of upcoming) {
    const s = DateTime.fromISO(occ.starts_at_utc, { zone: "utc" }).setZone(zone);
    const e = DateTime.fromISO(occ.ends_at_utc, { zone: "utc" }).setZone(zone);
    if (!s.isValid || !e.isValid) return null;

    const wd = s.weekday;
    const sh = hhmm(s);
    const eh = hhmm(e);

    if (weekday === null) {
      weekday = wd;
      startHHMM = sh;
      endHHMM = eh;
      continue;
    }
    if (wd !== weekday || sh !== startHHMM || eh !== endHHMM) return null;
  }

  if (weekday === null || !startHHMM || !endHHMM) return null;
  return {
    kind: "weekly",
    weekday,
    startLocalHHMM: startHHMM,
    endLocalHHMM: endHHMM,
    timezone: zone,
  };
}

/**
 * Derive a display cadence for an event series.
 *
 * Priority:
 *   1. If the primary event has a simple WEEKLY rrule (FREQ=WEEKLY, one BYDAY,
 *      duration set) — use it.
 *   2. Otherwise, if all upcoming occurrences agree on weekday + start + end
 *      time — infer from them (covers imported siblings that share series_id
 *      but have no rrule).
 *   3. Otherwise — null. UI shows "N upcoming dates".
 */
export function deriveSeriesCadence(
  event: CadenceEvent,
  upcoming: UpcomingOccurrence[],
): SeriesCadence | null {
  const anchor = upcoming[0]?.starts_at_utc ?? null;
  const fromNative = fromRrule(event, anchor);
  if (fromNative) return fromNative;
  return fromUpcoming(event, upcoming);
}

import { DateTime } from "luxon";
import { RRule, RRuleSet } from "rrule";

import type { EventOccurrenceRow, EventSeriesRow, LocationRow } from "../types/domain";

export type OccurrenceHorizon = {
  fromUtc: DateTime;
  toUtc: DateTime;
};

/**
 * Parse an ICS date-time string like "20260704T190000" or "20260704T190000Z".
 * Floating times (no Z) are interpreted in the fallback zone.
 */
function parseIcsDateTime(s: string, fallbackZone: string): Date {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) throw new Error(`Invalid ICS date-time: ${s}`);
  const [, y, mo, d, h, mi, se, z] = m;
  if (z === "Z") {
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}Z`);
  }
  const dt = DateTime.fromObject(
    { year: +y, month: +mo, day: +d, hour: +h, minute: +mi, second: +se },
    { zone: fallbackZone },
  );
  return dt.toJSDate();
}

/**
 * Parse an rrule string that may be either legacy single-line
 * ("FREQ=WEEKLY;BYDAY=MO") or multi-line RFC 5545 with EXDATE
 * ("RRULE:FREQ=WEEKLY;BYDAY=MO\nEXDATE:20260704T190000Z").
 * DTSTART comes from the separate column via the dtstart/zone args.
 */
export function parseRuleString(rruleStr: string, dtstart: Date, zone: string): RRule | RRuleSet {
  const lines = rruleStr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let rruleBody: string | null = null;
  const exdateLines: string[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith("RRULE:")) {
      rruleBody = line.slice("RRULE:".length);
    } else if (upper.startsWith("EXDATE")) {
      exdateLines.push(line);
    } else if (upper.startsWith("DTSTART")) {
      // Ignore — DTSTART comes from the dtstart argument.
    } else if (line.includes("=") && !line.includes(":")) {
      // Legacy: bare "FREQ=WEEKLY;..." with no RRULE: prefix.
      rruleBody = line;
    }
  }

  if (!rruleBody) {
    throw new Error("No RRULE found in rule string");
  }

  const parsed = RRule.parseString(rruleBody);
  parsed.dtstart = dtstart;
  parsed.tzid = zone;
  const rrule = new RRule(parsed);

  if (exdateLines.length === 0) {
    return rrule;
  }

  const set = new RRuleSet();
  set.rrule(rrule);
  for (const exLine of exdateLines) {
    const colonIdx = exLine.indexOf(":");
    if (colonIdx === -1) continue;
    const body = exLine.substring(colonIdx + 1);
    for (const token of body.split(",")) {
      const trimmed = token.trim();
      if (!trimmed) continue;
      set.exdate(parseIcsDateTime(trimmed, zone));
    }
  }
  return set;
}

export const defaultOccurrenceHorizon = (): OccurrenceHorizon => {
  const now = DateTime.utc();
  return {
    fromUtc: now.minus({ days: 30 }),
    toUtc: now.plus({ days: 365 }),
  };
};

export function generateOccurrences(
  event: EventSeriesRow,
  location: LocationRow | null,
  horizon: OccurrenceHorizon = defaultOccurrenceHorizon(),
): EventOccurrenceRow[] {
  if (event.schedule_kind === "single") {
    if (!event.single_start_at || !event.single_end_at) {
      return [];
    }

    const startUtc = DateTime.fromISO(event.single_start_at, { zone: "utc" });
    if (startUtc < horizon.fromUtc || startUtc > horizon.toUtc) {
      return [];
    }

    return [
      {
        eventId: event.id,
        startsAtUtc: startUtc.toUTC().toISO() ?? event.single_start_at,
        endsAtUtc: DateTime.fromISO(event.single_end_at, { zone: "utc" }).toUTC().toISO() ?? event.single_end_at,
        status: event.status === "cancelled" ? "cancelled" : "published",
        locationId: location?.id ?? null,
        countryCode: location?.country_code ?? null,
        city: location?.city ?? null,
        lat: location?.lat ?? null,
        lng: location?.lng ?? null,
      },
    ];
  }

  if (!event.rrule || !event.rrule_dtstart_local || !event.duration_minutes) {
    return [];
  }

  const zone = event.event_timezone;
  // pg returns timestamptz as a JS Date object; tests pass ISO strings. Support both.
  const rawDtstart: unknown = event.rrule_dtstart_local;
  let dtStartLocal: DateTime;
  if (rawDtstart instanceof Date) {
    dtStartLocal = DateTime.fromJSDate(rawDtstart, { zone });
  } else if (typeof rawDtstart === "string") {
    dtStartLocal = DateTime.fromISO(rawDtstart, { zone });
  } else {
    return [];
  }

  if (!dtStartLocal.isValid) {
    return [];
  }

  let rule: RRule | RRuleSet;
  try {
    rule = parseRuleString(event.rrule, dtStartLocal.toJSDate(), zone);
  } catch {
    return [];
  }
  const rangeStartLocal = horizon.fromUtc.setZone(zone);
  const rangeEndLocal = horizon.toUtc.setZone(zone);

  const starts = rule.between(rangeStartLocal.toJSDate(), rangeEndLocal.toJSDate(), true);

  return starts.map((startDate) => {
    const startLocal = DateTime.fromJSDate(startDate, { zone });
    const endLocal = startLocal.plus({ minutes: event.duration_minutes ?? 0 });

    return {
      eventId: event.id,
      startsAtUtc: startLocal.toUTC().toISO() ?? startLocal.toUTC().toString(),
      endsAtUtc: endLocal.toUTC().toISO() ?? endLocal.toUTC().toString(),
      status: event.status === "cancelled" ? "cancelled" : "published",
      locationId: location?.id ?? null,
      countryCode: location?.country_code ?? null,
      city: location?.city ?? null,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
    };
  });
}

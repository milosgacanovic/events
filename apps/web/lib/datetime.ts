import { DateTime } from "luxon";

export type FormattedDateTime = {
  primary: string;
  suffixLabel: "event" | "user";
};

export type TimeDisplayMode = "event" | "user";

function sameDay(start: DateTime, end: DateTime): boolean {
  return start.year === end.year && start.month === end.month && start.day === end.day;
}

function formatRange(start: DateTime, end: DateTime): string {
  if (sameDay(start, end)) {
    return `${start.toFormat("dd LLL yyyy")} · ${start.toFormat("HH:mm")}–${end.toFormat("HH:mm")}`;
  }

  return `${start.toFormat("dd LLL HH:mm")} – ${end.toFormat("dd LLL HH:mm yyyy")}`;
}

export function formatDateTimeRange(
  startsAtIso: string,
  endsAtIso: string,
  eventTimezone: string,
  mode: TimeDisplayMode = "user",
): FormattedDateTime {
  const startUtc = DateTime.fromISO(startsAtIso, { zone: "utc" });
  const endUtc = DateTime.fromISO(endsAtIso, { zone: "utc" });
  const useEventZone = mode === "event";
  const start = useEventZone ? startUtc.setZone(eventTimezone) : startUtc.toLocal();
  const end = useEventZone ? endUtc.setZone(eventTimezone) : endUtc.toLocal();
  const primary = formatRange(start, end);

  return {
    primary,
    suffixLabel: useEventZone ? "event" : "user",
  };
}

export function formatPointDateTime(
  startsAtIso: string,
  eventTimezone: string,
  mode: TimeDisplayMode = "user",
): FormattedDateTime {
  const startUtc = DateTime.fromISO(startsAtIso, { zone: "utc" });
  const useEventZone = mode === "event";
  const start = useEventZone ? startUtc.setZone(eventTimezone) : startUtc.toLocal();

  return {
    primary: `${start.toFormat("dd LLL yyyy")} · ${start.toFormat("HH:mm")}`,
    suffixLabel: useEventZone ? "event" : "user",
  };
}

/**
 * ISO 8601 in the event's local time with its UTC offset, e.g.
 * "2026-11-11T18:30:00-06:00" (Google's preferred Event JSON-LD form).
 * Falls back to the UTC ISO string when the zone is unknown/invalid.
 */
export function toZonedIsoString(isoUtc: string, timeZone: string | null | undefined): string {
  const utc = DateTime.fromISO(isoUtc, { zone: "utc" });
  if (!utc.isValid) return isoUtc;
  if (!timeZone) return utc.toISO({ suppressMilliseconds: true }) ?? isoUtc;
  const local = utc.setZone(timeZone);
  if (!local.isValid) return utc.toISO({ suppressMilliseconds: true }) ?? isoUtc;
  return local.toISO({ suppressMilliseconds: true, includeOffset: true }) ?? isoUtc;
}

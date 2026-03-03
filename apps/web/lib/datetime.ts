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

import { DateTime } from "luxon";

export type FormattedDateTime = {
  primary: string;
  secondary: string | null;
};

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
): FormattedDateTime {
  const startUtc = DateTime.fromISO(startsAtIso, { zone: "utc" });
  const endUtc = DateTime.fromISO(endsAtIso, { zone: "utc" });

  const userStart = startUtc.toLocal();
  const userEnd = endUtc.toLocal();
  const eventStart = startUtc.setZone(eventTimezone);
  const eventEnd = endUtc.setZone(eventTimezone);

  const primary = formatRange(userStart, userEnd);
  const sameZone = userStart.zoneName === eventStart.zoneName;
  const secondary = sameZone
    ? null
    : `Event time: ${formatRange(eventStart, eventEnd)} (${eventTimezone})`;

  return {
    primary,
    secondary,
  };
}

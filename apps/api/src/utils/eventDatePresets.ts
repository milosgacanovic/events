import { DateTime } from "luxon";

export const EVENT_DATE_PRESETS = [
  "today",
  "tomorrow",
  "this_weekend",
  "this_week",
  "next_week",
  "this_month",
  "next_month",
] as const;

export type EventDatePreset = (typeof EVENT_DATE_PRESETS)[number];

export type EventDateRange = {
  fromUtc: string;
  toUtc: string;
};

export function parseEventDatePresets(value?: string): EventDatePreset[] {
  if (!value) {
    return [];
  }

  const allowed = new Set<EventDatePreset>(EVENT_DATE_PRESETS);
  const unique = new Set<EventDatePreset>();
  for (const item of value.split(",")) {
    const normalized = item.trim().toLowerCase() as EventDatePreset;
    if (allowed.has(normalized)) {
      unique.add(normalized);
    }
  }
  return Array.from(unique);
}

export function resolveSafeTimeZone(value?: string): string {
  if (!value) {
    return "UTC";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "UTC";
  }
  const probe = DateTime.now().setZone(trimmed);
  return probe.isValid ? trimmed : "UTC";
}

export function buildEventDateRangeMap(
  timezone: string,
  nowUtc: DateTime = DateTime.utc(),
): Record<EventDatePreset, EventDateRange> {
  const zoneNow = nowUtc.setZone(timezone);

  const todayStart = zoneNow.startOf("day");
  const tomorrowStart = todayStart.plus({ days: 1 });

  const weekday = zoneNow.weekday;
  const weekendStart = weekday <= 5
    ? todayStart.plus({ days: 6 - weekday })
    : weekday === 6
      ? todayStart
      : todayStart.minus({ days: 1 });
  const weekendEnd = weekendStart.plus({ days: 2 });

  const thisWeekStart = zoneNow.startOf("week");
  const nextWeekStart = thisWeekStart.plus({ weeks: 1 });
  const weekAfterNextStart = nextWeekStart.plus({ weeks: 1 });

  const thisMonthStart = zoneNow.startOf("month");
  const nextMonthStart = thisMonthStart.plus({ months: 1 });
  const monthAfterNextStart = nextMonthStart.plus({ months: 1 });

  const toRange = (from: DateTime, to: DateTime): EventDateRange => ({
    fromUtc: from.toUTC().toISO()!,
    toUtc: to.toUTC().toISO()!,
  });

  return {
    today: toRange(todayStart, tomorrowStart),
    tomorrow: toRange(tomorrowStart, tomorrowStart.plus({ days: 1 })),
    this_weekend: toRange(weekendStart, weekendEnd),
    this_week: toRange(thisWeekStart, nextWeekStart),
    next_week: toRange(nextWeekStart, weekAfterNextStart),
    this_month: toRange(thisMonthStart, nextMonthStart),
    next_month: toRange(nextMonthStart, monthAfterNextStart),
  };
}

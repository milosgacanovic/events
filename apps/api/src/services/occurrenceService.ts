import { DateTime } from "luxon";
import { RRule } from "rrule";

import type { EventOccurrenceRow, EventSeriesRow, LocationRow } from "../types/domain";

export type OccurrenceHorizon = {
  fromUtc: DateTime;
  toUtc: DateTime;
};

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
  const dtStartLocal = DateTime.fromISO(event.rrule_dtstart_local, { zone });

  const parsedOptions = RRule.parseString(event.rrule);
  parsedOptions.dtstart = dtStartLocal.toJSDate();
  parsedOptions.tzid = zone;

  const rule = new RRule(parsedOptions);
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

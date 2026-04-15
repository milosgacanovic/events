"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RRule, RRuleSet, rrulestr } from "rrule";

import { useI18n } from "../i18n/I18nProvider";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
type DayCode = (typeof DAY_CODES)[number];

const SETPOS_OPTIONS = [
  { value: 1, key: "manage.eventForm.rrule.monthly.pos.first", fallback: "First" },
  { value: 2, key: "manage.eventForm.rrule.monthly.pos.second", fallback: "Second" },
  { value: 3, key: "manage.eventForm.rrule.monthly.pos.third", fallback: "Third" },
  { value: 4, key: "manage.eventForm.rrule.monthly.pos.fourth", fallback: "Fourth" },
  { value: -1, key: "manage.eventForm.rrule.monthly.pos.last", fallback: "Last" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FreqKind = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type MonthlyMode = "byMonthDay" | "bySetPos";
type EndsMode = "never" | "onDate" | "afterN";
type Exclusion = { kind: "date"; date: string } | { kind: "range"; from: string; to: string };

type ParsedRule = {
  freq: FreqKind;
  interval: number;
  byDay: Set<DayCode>;
  monthDay: number | null;
  setPos: number | null;
  setPosDay: DayCode | null;
  until: string; // YYYY-MM-DD
  count: number | null;
  exdatesISO: string[]; // ISO strings like "2026-07-04T19:00:00Z" or "2026-07-04T19:00:00"
};

// ---------------------------------------------------------------------------
// Parsing / serializing
// ---------------------------------------------------------------------------

function parseRruleString(rruleStr: string): ParsedRule {
  const defaults: ParsedRule = {
    freq: "WEEKLY",
    interval: 1,
    byDay: new Set(),
    monthDay: null,
    setPos: null,
    setPosDay: null,
    until: "",
    count: null,
    exdatesISO: [],
  };
  if (!rruleStr) return defaults;

  const lines = rruleStr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let rruleBody = "";
  const exdateLines: string[] = [];
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith("RRULE:")) rruleBody = line.slice(6);
    else if (upper.startsWith("EXDATE")) exdateLines.push(line);
    else if (upper.startsWith("DTSTART")) {
      /* ignore */
    } else if (line.includes("=") && !line.includes(":")) rruleBody = line;
  }
  if (!rruleBody) rruleBody = lines[0] ?? "";

  const parts = new Map<string, string>();
  for (const seg of rruleBody.split(";")) {
    const [k, v] = seg.split("=");
    if (k && v !== undefined) parts.set(k.toUpperCase(), v);
  }

  const rawFreq = parts.get("FREQ") ?? "WEEKLY";
  const freq: FreqKind = (["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(rawFreq)
    ? rawFreq
    : "WEEKLY") as FreqKind;

  const byDay = new Set<DayCode>();
  let setPos: number | null = null;
  let setPosDay: DayCode | null = null;

  const byDayRaw = parts.get("BYDAY") ?? "";
  if (byDayRaw) {
    for (const tok of byDayRaw.split(",")) {
      const m = tok.match(/^(-?\d+)?([A-Z]{2})$/);
      if (!m) continue;
      const pos = m[1] ? parseInt(m[1], 10) : null;
      const code = m[2] as DayCode;
      if (!DAY_CODES.includes(code)) continue;
      if (pos !== null) {
        setPos = pos;
        setPosDay = code;
      } else {
        byDay.add(code);
      }
    }
  }

  const bySetPosRaw = parts.get("BYSETPOS");
  if (bySetPosRaw && setPos === null) {
    const n = parseInt(bySetPosRaw, 10);
    if (!isNaN(n)) setPos = n;
    // When BYSETPOS is used alongside a bare BYDAY, the first byDay becomes the setPosDay
    if (setPosDay === null && byDay.size >= 1) {
      setPosDay = Array.from(byDay)[0];
      byDay.clear();
    }
  }

  const monthDayRaw = parts.get("BYMONTHDAY");
  const monthDay = monthDayRaw ? parseInt(monthDayRaw, 10) : null;

  const untilRaw = parts.get("UNTIL") ?? "";
  const untilMatch = untilRaw.match(/^(\d{4})(\d{2})(\d{2})/);
  const until = untilMatch ? `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}` : "";

  const countRaw = parts.get("COUNT");
  const count = countRaw ? parseInt(countRaw, 10) : null;

  const exdatesISO: string[] = [];
  for (const exLine of exdateLines) {
    const idx = exLine.indexOf(":");
    if (idx === -1) continue;
    const body = exLine.slice(idx + 1);
    for (const tok of body.split(",")) {
      const trimmed = tok.trim();
      const m = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
      if (!m) continue;
      const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7]}`;
      exdatesISO.push(iso);
    }
  }

  return {
    freq,
    interval: parseInt(parts.get("INTERVAL") ?? "1", 10) || 1,
    byDay,
    monthDay,
    setPos,
    setPosDay,
    until,
    count,
    exdatesISO,
  };
}

function dateToIcsDate(date: string): string {
  // "2026-12-31" -> "20261231T235959Z"
  return date.replace(/-/g, "") + "T235959Z";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIcsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function computeDuration(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 90;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${pad(hh)}:${pad(mm)}`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function todayISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function expandRangeExdates(
  range: { from: string; to: string },
  rrule: string,
  dtstartLocal: string,
): string[] {
  // Build a temporary rule (without exdates) and find every occurrence in the range.
  try {
    const tmpRule = rrulestr(stripExdates(rrule), {
      dtstart: new Date(dtstartLocal + "Z"),
      forceset: false,
    });
    const from = new Date(range.from + "T00:00:00Z");
    const to = new Date(range.to + "T23:59:59Z");
    const hits = tmpRule.between(from, to, true);
    return hits.map((d) => d.toISOString().replace(/\.\d+Z$/, "Z"));
  } catch {
    return [];
  }
}

function stripExdates(rruleStr: string): string {
  return rruleStr
    .split(/\r?\n/)
    .filter((l) => !l.trim().toUpperCase().startsWith("EXDATE"))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Preset patterns
// ---------------------------------------------------------------------------

type Preset = {
  key: string;
  fallback: string;
  apply: () => {
    freq: FreqKind;
    interval: number;
    byDay: Set<DayCode>;
    monthDay: number | null;
    setPos: number | null;
    setPosDay: DayCode | null;
    monthlyMode: MonthlyMode;
    startTime: string;
    endTime: string;
    exclusions: Exclusion[];
  };
};

const PRESETS: Preset[] = [
  {
    key: "manage.eventForm.rrule.help.presets.weeklyTuesday",
    fallback: "Weekly — every Tuesday 7pm",
    apply: () => ({
      freq: "WEEKLY",
      interval: 1,
      byDay: new Set<DayCode>(["TU"]),
      monthDay: null,
      setPos: null,
      setPosDay: null,
      monthlyMode: "byMonthDay",
      startTime: "19:00",
      endTime: "20:30",
      exclusions: [],
    }),
  },
  {
    key: "manage.eventForm.rrule.help.presets.biweeklySaturday",
    fallback: "Biweekly — every other Saturday 7pm",
    apply: () => ({
      freq: "WEEKLY",
      interval: 2,
      byDay: new Set<DayCode>(["SA"]),
      monthDay: null,
      setPos: null,
      setPosDay: null,
      monthlyMode: "byMonthDay",
      startTime: "19:00",
      endTime: "20:30",
      exclusions: [],
    }),
  },
  {
    key: "manage.eventForm.rrule.help.presets.firstSaturday",
    fallback: "First Saturday of every month 8pm",
    apply: () => ({
      freq: "MONTHLY",
      interval: 1,
      byDay: new Set<DayCode>(),
      monthDay: null,
      setPos: 1,
      setPosDay: "SA" as DayCode,
      monthlyMode: "bySetPos",
      startTime: "20:00",
      endTime: "22:00",
      exclusions: [],
    }),
  },
  {
    key: "manage.eventForm.rrule.help.presets.weekdayDaily",
    fallback: "Weekdays — Mon–Fri 9am",
    apply: () => ({
      freq: "WEEKLY",
      interval: 1,
      byDay: new Set<DayCode>(["MO", "TU", "WE", "TH", "FR"]),
      monthDay: null,
      setPos: null,
      setPosDay: null,
      monthlyMode: "byMonthDay",
      startTime: "09:00",
      endTime: "10:00",
      exclusions: [],
    }),
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RruleBuilder({
  rrule,
  dtstartLocal,
  durationMinutes,
  eventTimezone,
  onChange,
}: {
  rrule: string;
  dtstartLocal: string;
  durationMinutes: string;
  eventTimezone?: string;
  onChange: (rrule: string, dtstartLocal: string, durationMinutes: string) => void;
}) {
  const { t, locale } = useI18n();

  const tt = useCallback(
    (key: string, fallback: string) => {
      const result = t(key);
      return result && result !== key ? result : fallback;
    },
    [t],
  );

  // Localized day short + long names via Intl
  const dayNames = useMemo(() => {
    const short: Record<DayCode, string> = {} as Record<DayCode, string>;
    const long: Record<DayCode, string> = {} as Record<DayCode, string>;
    // Use a known Monday-Sunday week (2024-01-01 was Monday)
    const base = new Date(Date.UTC(2024, 0, 1));
    const fmtShort = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const fmtLong = new Intl.DateTimeFormat(locale, { weekday: "long" });
    DAY_CODES.forEach((code, idx) => {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + idx);
      short[code] = fmtShort.format(d);
      long[code] = fmtLong.format(d);
    });
    return { short, long };
  }, [locale]);

  // ---- Initial parse from props ----
  const parsed = useMemo(() => parseRruleString(rrule), [rrule]);

  const [freq, setFreq] = useState<FreqKind>(parsed.freq);
  const [interval, setIntervalValue] = useState<number>(parsed.interval);
  const [byDay, setByDay] = useState<Set<DayCode>>(new Set(parsed.byDay));

  // Monthly state
  const initialMonthlyMode: MonthlyMode = parsed.setPos !== null ? "bySetPos" : "byMonthDay";
  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>(initialMonthlyMode);
  const [monthDay, setMonthDay] = useState<number>(parsed.monthDay ?? 1);
  const [setPos, setSetPos] = useState<number>(parsed.setPos ?? 1);
  const [setPosDay, setSetPosDay] = useState<DayCode>(parsed.setPosDay ?? "SA");

  // Date + times
  const [startDate, setStartDate] = useState<string>(() => {
    if (dtstartLocal && dtstartLocal.length >= 10) return dtstartLocal.slice(0, 10);
    return todayISODate();
  });
  const [startTime, setStartTime] = useState<string>(() => {
    if (dtstartLocal && dtstartLocal.length >= 16) return dtstartLocal.slice(11, 16);
    return "19:00";
  });
  const [endTime, setEndTime] = useState<string>(() => {
    const dur = parseInt(durationMinutes, 10) || 90;
    const st = dtstartLocal && dtstartLocal.length >= 16 ? dtstartLocal.slice(11, 16) : "19:00";
    return addMinutesToTime(st, dur);
  });

  // Ends (UNTIL | COUNT | never)
  const initialEndsMode: EndsMode = parsed.count ? "afterN" : parsed.until ? "onDate" : "never";
  const [endsMode, setEndsMode] = useState<EndsMode>(initialEndsMode);
  const [untilDate, setUntilDate] = useState<string>(parsed.until);
  const [countValue, setCountValue] = useState<number>(parsed.count ?? 10);

  // Exclusions
  const [exclusions, setExclusions] = useState<Exclusion[]>(() => {
    if (!parsed.exdatesISO.length) return [];
    // Preserve as individual date entries on load — user can regroup visually if they want.
    return parsed.exdatesISO.map((iso) => ({ kind: "date" as const, date: iso.slice(0, 10) }));
  });
  const [showExclusions, setShowExclusions] = useState<boolean>(parsed.exdatesISO.length > 0);
  const [newExDate, setNewExDate] = useState<string>("");
  const [newExRangeFrom, setNewExRangeFrom] = useState<string>("");
  const [newExRangeTo, setNewExRangeTo] = useState<string>("");
  const [showRangeForm, setShowRangeForm] = useState<boolean>(false);

  // Help popover
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const helpRef = useRef<HTMLDivElement>(null);

  // Close help popover on outside click
  useEffect(() => {
    if (!showHelp) return;
    const handler = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showHelp]);

  const duration = useMemo(() => computeDuration(startTime, endTime), [startTime, endTime]);

  // ---- Build rrule string ----
  const buildRrule = useCallback((): string => {
    const parts: string[] = [`FREQ=${freq}`];
    if (interval > 1) parts.push(`INTERVAL=${interval}`);
    if (freq === "WEEKLY" && byDay.size > 0) {
      parts.push(`BYDAY=${Array.from(byDay).join(",")}`);
    }
    if (freq === "MONTHLY") {
      if (monthlyMode === "byMonthDay") {
        parts.push(`BYMONTHDAY=${monthDay}`);
      } else {
        parts.push(`BYDAY=${setPosDay}`);
        parts.push(`BYSETPOS=${setPos}`);
      }
    }
    if (endsMode === "onDate" && untilDate) parts.push(`UNTIL=${dateToIcsDate(untilDate)}`);
    if (endsMode === "afterN" && countValue > 0) parts.push(`COUNT=${countValue}`);

    const rruleLine = parts.join(";");

    // Collect EXDATE entries (single dates + expanded ranges)
    const exIsos: string[] = [];
    const zone = eventTimezone || "UTC";
    for (const ex of exclusions) {
      if (ex.kind === "date") {
        // Convert local (date at startTime in zone) to UTC Z
        try {
          const localStr = `${ex.date}T${startTime}:00`;
          const d = zonedLocalToUtc(localStr, zone);
          exIsos.push(toIcsUtc(d));
        } catch {
          /* skip invalid */
        }
      } else {
        // Range: expand client-side. Build a temp RRULE string with no exdates for the expansion.
        try {
          const tmp = rruleLine;
          const dtstartUtc = zonedLocalToUtc(`${startDate}T${startTime}:00`, zone);
          const rule = rrulestr(tmp, { dtstart: dtstartUtc, forceset: false });
          const from = new Date(ex.from + "T00:00:00Z");
          const to = new Date(ex.to + "T23:59:59Z");
          for (const d of rule.between(from, to, true)) exIsos.push(toIcsUtc(d));
        } catch {
          /* skip */
        }
      }
    }

    if (exIsos.length === 0) return rruleLine;
    // Multi-line: need RRULE: prefix for rrulestr to parse correctly
    const unique = Array.from(new Set(exIsos)).sort();
    return `RRULE:${rruleLine}\nEXDATE:${unique.join(",")}`;
  }, [freq, interval, byDay, monthlyMode, monthDay, setPos, setPosDay, endsMode, untilDate, countValue, exclusions, eventTimezone, startDate, startTime]);

  const buildDtstart = useCallback((): string => {
    if (!startDate) return "";
    return `${startDate}T${startTime || "00:00"}`;
  }, [startDate, startTime]);

  // Emit upstream
  const lastEmitted = useRef({ rrule: "", dtstart: "", duration: "" });
  useEffect(() => {
    const newRrule = buildRrule();
    const newDtstart = buildDtstart();
    const newDuration = String(duration);
    const prev = lastEmitted.current;
    if (newRrule === prev.rrule && newDtstart === prev.dtstart && newDuration === prev.duration) return;
    lastEmitted.current = { rrule: newRrule, dtstart: newDtstart, duration: newDuration };
    onChange(newRrule, newDtstart, newDuration);
  }, [buildRrule, buildDtstart, duration, onChange]);

  // ---- Compute next 3 occurrences preview ----
  const ambiguous = freq === "WEEKLY" && byDay.size === 0;

  const nextOccurrences = useMemo(() => {
    if (ambiguous || !startDate) return [];
    try {
      const zone = eventTimezone || "UTC";
      const dtstart = zonedLocalToUtc(`${startDate}T${startTime}:00`, zone);
      const ruleStr = buildRrule();
      const rule = rrulestr(ruleStr, { dtstart, forceset: false });
      const now = new Date();
      return rule.between(now, new Date(now.getTime() + 365 * 24 * 3600 * 1000), true).slice(0, 3);
    } catch {
      return [];
    }
  }, [buildRrule, startDate, startTime, eventTimezone, ambiguous]);

  // ---- Preview prose ----
  const previewText = useMemo(() => {
    if (ambiguous) return tt("manage.eventForm.rrule.preview.pickDays", "Pick at least one day.");
    const parts: string[] = [];
    const every = tt("manage.eventForm.rrule.every", "Every");
    const freqLabel = (() => {
      if (freq === "DAILY") return interval > 1 ? `${interval} ${tt("manage.eventForm.rrule.freqPlural.day", "days")}` : tt("manage.eventForm.rrule.freqSingular.day", "day");
      if (freq === "WEEKLY") return interval > 1 ? `${interval} ${tt("manage.eventForm.rrule.freqPlural.week", "weeks")}` : tt("manage.eventForm.rrule.freqSingular.week", "week");
      if (freq === "MONTHLY") return interval > 1 ? `${interval} ${tt("manage.eventForm.rrule.freqPlural.month", "months")}` : tt("manage.eventForm.rrule.freqSingular.month", "month");
      return interval > 1 ? `${interval} ${tt("manage.eventForm.rrule.freqPlural.year", "years")}` : tt("manage.eventForm.rrule.freqSingular.year", "year");
    })();
    parts.push(`${every} ${freqLabel}`);

    if (freq === "WEEKLY" && byDay.size > 0) {
      const days = DAY_CODES.filter((c) => byDay.has(c)).map((c) => dayNames.long[c]);
      parts.push(`${tt("manage.eventForm.rrule.on", "on")} ${days.join(", ")}`);
    }
    if (freq === "MONTHLY") {
      if (monthlyMode === "byMonthDay") {
        parts.push(`${tt("manage.eventForm.rrule.on", "on")} ${tt("manage.eventForm.rrule.monthly.dayN", "day")} ${monthDay}`);
      } else {
        const posLabel = tt(
          SETPOS_OPTIONS.find((p) => p.value === setPos)?.key ?? "",
          SETPOS_OPTIONS.find((p) => p.value === setPos)?.fallback ?? "First",
        );
        parts.push(`${tt("manage.eventForm.rrule.on", "on").toLowerCase()} ${tt("manage.eventForm.rrule.the", "the")} ${posLabel.toLowerCase()} ${dayNames.long[setPosDay]}`);
      }
    }
    if (startTime && endTime) parts[parts.length - 1] += `, ${startTime}\u2013${endTime}`;
    if (startDate) {
      const d = new Date(startDate + "T00:00:00");
      const fmt = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", year: "numeric" });
      parts.push(`${tt("manage.eventForm.rrule.starting", "starting")} ${fmt.format(d)}`);
    }
    if (endsMode === "onDate" && untilDate) {
      const d = new Date(untilDate + "T00:00:00");
      const fmt = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", year: "numeric" });
      parts.push(`${tt("manage.eventForm.rrule.until", "until")} ${fmt.format(d)}`);
    }
    if (endsMode === "afterN") {
      parts.push(`(${countValue} ${tt("manage.eventForm.rrule.occurrences", "occurrences")})`);
    }
    return parts.join(" ");
  }, [ambiguous, freq, interval, byDay, monthlyMode, monthDay, setPos, setPosDay, dayNames, startTime, endTime, startDate, endsMode, untilDate, countValue, tt, locale]);

  // ---- Handlers ----
  function toggleDay(code: DayCode) {
    setByDay((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function applyPreset(p: Preset) {
    const s = p.apply();
    setFreq(s.freq);
    setIntervalValue(s.interval);
    setByDay(s.byDay);
    setMonthDay(s.monthDay ?? 1);
    setSetPos(s.setPos ?? 1);
    setSetPosDay(s.setPosDay ?? "SA");
    setMonthlyMode(s.monthlyMode);
    setStartTime(s.startTime);
    setEndTime(s.endTime);
    setExclusions(s.exclusions);
    if (!startDate) setStartDate(todayISODate());
    setShowHelp(false);
  }

  function addExclusionDate() {
    if (!newExDate) return;
    setExclusions((prev) => [...prev, { kind: "date", date: newExDate }]);
    setNewExDate("");
  }

  function addExclusionRange() {
    if (!newExRangeFrom || !newExRangeTo) return;
    setExclusions((prev) => [...prev, { kind: "range", from: newExRangeFrom, to: newExRangeTo }]);
    setNewExRangeFrom("");
    setNewExRangeTo("");
    setShowRangeForm(false);
  }

  function removeExclusion(idx: number) {
    setExclusions((prev) => prev.filter((_, i) => i !== idx));
  }

  // ---- Render ----
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", weekday: "short" }),
    [locale],
  );

  return (
    <div className="rrule-builder">
      {/* Help popover trigger */}
      <div className="rrule-help-wrap" ref={helpRef}>
        <button
          type="button"
          className="rrule-help-btn"
          aria-label={tt("manage.eventForm.rrule.help.title", "Examples")}
          aria-expanded={showHelp}
          onClick={() => setShowHelp((v) => !v)}
        >
          ?
        </button>
        {showHelp && (
          <div className="rrule-help-popover" role="dialog">
            <div className="rrule-help-title">{tt("manage.eventForm.rrule.help.title", "Examples — click to use")}</div>
            {PRESETS.map((p) => (
              <button key={p.key} type="button" className="rrule-help-preset" onClick={() => applyPreset(p)}>
                {tt(p.key, p.fallback)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Frequency row */}
      <div className="rrule-row">
        <span className="rrule-row-label">{tt("manage.eventForm.rrule.every", "Every")}</span>
        <input
          type="number"
          min={1}
          max={52}
          value={interval}
          onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="rrule-interval"
          aria-label={tt("manage.eventForm.rrule.interval", "Interval")}
        />
        <select value={freq} onChange={(e) => setFreq(e.target.value as FreqKind)} aria-label={tt("manage.eventForm.rrule.frequency", "Frequency")}>
          <option value="DAILY">{interval > 1 ? tt("manage.eventForm.rrule.freqPlural.day", "days") : tt("manage.eventForm.rrule.freqSingular.day", "day")}</option>
          <option value="WEEKLY">{interval > 1 ? tt("manage.eventForm.rrule.freqPlural.week", "weeks") : tt("manage.eventForm.rrule.freqSingular.week", "week")}</option>
          <option value="MONTHLY">{interval > 1 ? tt("manage.eventForm.rrule.freqPlural.month", "months") : tt("manage.eventForm.rrule.freqSingular.month", "month")}</option>
          <option value="YEARLY">{interval > 1 ? tt("manage.eventForm.rrule.freqPlural.year", "years") : tt("manage.eventForm.rrule.freqSingular.year", "year")}</option>
        </select>
      </div>

      {/* Weekly: day chips */}
      {freq === "WEEKLY" && (
        <div>
          <label className="rrule-sublabel">{tt("manage.eventForm.rrule.onDays", "On days")}</label>
          <div className="rrule-day-chips">
            {DAY_CODES.map((code) => (
              <button
                key={code}
                type="button"
                className="rrule-day-btn"
                data-active={byDay.has(code) ? "true" : "false"}
                aria-pressed={byDay.has(code)}
                onClick={() => toggleDay(code)}
              >
                {dayNames.short[code]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Monthly: radio */}
      {freq === "MONTHLY" && (
        <div className="rrule-monthly">
          <label className="rrule-monthly-row">
            <input
              type="radio"
              name="rrule-monthly-mode"
              checked={monthlyMode === "byMonthDay"}
              onChange={() => setMonthlyMode("byMonthDay")}
            />
            <span>{tt("manage.eventForm.rrule.monthly.dayOfMonthPrefix", "Day")}</span>
            <input
              type="number"
              min={1}
              max={31}
              value={monthDay}
              onChange={(e) => {
                setMonthDay(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)));
                setMonthlyMode("byMonthDay");
              }}
              className="rrule-interval"
            />
            <span>{tt("manage.eventForm.rrule.monthly.dayOfMonthSuffix", "of every month")}</span>
          </label>
          <label className="rrule-monthly-row">
            <input
              type="radio"
              name="rrule-monthly-mode"
              checked={monthlyMode === "bySetPos"}
              onChange={() => setMonthlyMode("bySetPos")}
            />
            <span>{tt("manage.eventForm.rrule.monthly.thePrefix", "The")}</span>
            <select
              value={setPos}
              onChange={(e) => {
                setSetPos(parseInt(e.target.value, 10));
                setMonthlyMode("bySetPos");
              }}
            >
              {SETPOS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {tt(o.key, o.fallback)}
                </option>
              ))}
            </select>
            <select
              value={setPosDay}
              onChange={(e) => {
                setSetPosDay(e.target.value as DayCode);
                setMonthlyMode("bySetPos");
              }}
            >
              {DAY_CODES.map((code) => (
                <option key={code} value={code}>
                  {dayNames.long[code]}
                </option>
              ))}
            </select>
            <span>{tt("manage.eventForm.rrule.monthly.thePosSuffix", "of every month")}</span>
          </label>
        </div>
      )}

      {/* Times */}
      <div className="rrule-times">
        <div>
          <label className="rrule-sublabel" htmlFor="rrule-start-time">
            {tt("manage.eventForm.rrule.startTime", "Start time")}
          </label>
          <input
            id="rrule-start-time"
            type="time"
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value);
              setEndTime(addMinutesToTime(e.target.value, duration));
            }}
          />
        </div>
        <div>
          <label className="rrule-sublabel" htmlFor="rrule-end-time">
            {tt("manage.eventForm.rrule.endTime", "End time")}
          </label>
          <input id="rrule-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div className="rrule-duration">{formatDuration(duration)}</div>
      </div>

      {/* Series starts */}
      <div>
        <label className="rrule-sublabel" htmlFor="rrule-start-date">
          {tt("manage.eventForm.rrule.seriesStarts", "Series starts")}
        </label>
        <input
          id="rrule-start-date"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>

      {/* Series ends: radio triad */}
      <fieldset className="rrule-ends">
        <legend className="rrule-sublabel">{tt("manage.eventForm.rrule.seriesEnds", "Series ends")}</legend>
        <label className="rrule-ends-row">
          <input
            type="radio"
            name="rrule-ends"
            checked={endsMode === "never"}
            onChange={() => setEndsMode("never")}
          />
          <span>{tt("manage.eventForm.rrule.never", "Never")}</span>
        </label>
        <label className="rrule-ends-row">
          <input type="radio" name="rrule-ends" checked={endsMode === "onDate"} onChange={() => setEndsMode("onDate")} />
          <span>{tt("manage.eventForm.rrule.onDate", "On")}</span>
          <input
            type="date"
            value={untilDate}
            onChange={(e) => {
              setUntilDate(e.target.value);
              setEndsMode("onDate");
            }}
            disabled={endsMode !== "onDate"}
          />
        </label>
        <label className="rrule-ends-row">
          <input type="radio" name="rrule-ends" checked={endsMode === "afterN"} onChange={() => setEndsMode("afterN")} />
          <span>{tt("manage.eventForm.rrule.afterN", "After")}</span>
          <input
            type="number"
            min={1}
            max={999}
            value={countValue}
            onChange={(e) => {
              setCountValue(Math.max(1, parseInt(e.target.value, 10) || 1));
              setEndsMode("afterN");
            }}
            className="rrule-interval"
            disabled={endsMode !== "afterN"}
          />
          <span>{tt("manage.eventForm.rrule.occurrences", "occurrences")}</span>
        </label>
      </fieldset>

      {/* Exclusions disclosure */}
      <div>
        <button type="button" className="rrule-disclosure" onClick={() => setShowExclusions((v) => !v)} aria-expanded={showExclusions}>
          <span>{showExclusions ? "▾" : "▸"}</span>{" "}
          {tt("manage.eventForm.rrule.exclusions.title", "Exclude dates (holidays, breaks)")}
          {exclusions.length > 0 && ` (${exclusions.length})`}
        </button>
        {showExclusions && (
          <div className="rrule-exclusions">
            {exclusions.length > 0 && (
              <div className="rrule-exclusion-chips">
                {exclusions.map((ex, idx) => (
                  <span key={idx} className="rrule-exclusion-chip">
                    {ex.kind === "date"
                      ? dateFmt.format(new Date(ex.date + "T00:00:00"))
                      : `${dateFmt.format(new Date(ex.from + "T00:00:00"))} → ${dateFmt.format(new Date(ex.to + "T00:00:00"))}`}
                    <button
                      type="button"
                      className="rrule-exclusion-remove"
                      aria-label={tt("manage.eventForm.rrule.exclusions.remove", "Remove")}
                      onClick={() => removeExclusion(idx)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="rrule-exclusion-add">
              <input type="date" value={newExDate} onChange={(e) => setNewExDate(e.target.value)} />
              <button type="button" onClick={addExclusionDate} disabled={!newExDate}>
                {tt("manage.eventForm.rrule.exclusions.addDate", "Add date")}
              </button>
              <button type="button" onClick={() => setShowRangeForm((v) => !v)}>
                {tt("manage.eventForm.rrule.exclusions.addRange", "Add range")}
              </button>
            </div>
            {showRangeForm && (
              <div className="rrule-exclusion-add">
                <input type="date" value={newExRangeFrom} onChange={(e) => setNewExRangeFrom(e.target.value)} />
                <span>→</span>
                <input type="date" value={newExRangeTo} onChange={(e) => setNewExRangeTo(e.target.value)} />
                <button type="button" onClick={addExclusionRange} disabled={!newExRangeFrom || !newExRangeTo}>
                  {tt("manage.eventForm.rrule.exclusions.saveRange", "Save")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview */}
      <div className={`rrule-preview${ambiguous ? " rrule-preview--warning" : ""}`}>
        <div className="rrule-preview-text">{previewText}</div>
        {nextOccurrences.length > 0 && !ambiguous && (
          <div className="rrule-preview-next">
            {tt("manage.eventForm.rrule.nextOccurrences", "Next")}: {nextOccurrences.map((d) => dateFmt.format(d)).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timezone helper
// ---------------------------------------------------------------------------

/**
 * Interpret a local date-time string ("2026-04-15T19:00:00") as being in the given IANA timezone
 * and return a JS Date representing the equivalent UTC instant. Mirrors the server-side Luxon logic.
 */
function zonedLocalToUtc(localISO: string, timeZone: string): Date {
  // Parse components
  const m = localISO.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(localISO);
  const [, y, mo, d, h, mi, s] = m;
  // Approach: construct as UTC, then adjust by the timezone's offset at that wall-clock time.
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? "0"));
  // Get the timezone's offset at `asUtc` (in minutes). Intl gives us the wall-clock rendering; difference
  // between the wall clock and UTC gives the offset.
  const tzStr = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(asUtc));
  const parts = tzStr.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!parts) return new Date(asUtc);
  const [, pMo, pD, pY, pH, pMi, pS] = parts;
  const asWall = Date.UTC(+pY, +pMo - 1, +pD, +pH, +pMi, +pS);
  const offset = asUtc - asWall; // ms offset of timeZone relative to UTC at that moment
  return new Date(asUtc + offset);
}

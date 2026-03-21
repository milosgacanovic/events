"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const DAYS = [
  { code: "MO", label: "Mon" },
  { code: "TU", label: "Tue" },
  { code: "WE", label: "Wed" },
  { code: "TH", label: "Thu" },
  { code: "FR", label: "Fri" },
  { code: "SA", label: "Sat" },
  { code: "SU", label: "Sun" },
];

const DAY_LABELS: Record<string, string> = {
  MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday",
  FR: "Friday", SA: "Saturday", SU: "Sunday",
};

function parseRrule(rrule: string): {
  freq: string; interval: number; byDay: Set<string>; until: string;
} {
  const parts = new Map<string, string>();
  for (const seg of rrule.split(";")) {
    const [k, v] = seg.split("=");
    if (k && v) parts.set(k.toUpperCase(), v);
  }
  return {
    freq: parts.get("FREQ") ?? "WEEKLY",
    interval: parseInt(parts.get("INTERVAL") ?? "1", 10) || 1,
    byDay: new Set((parts.get("BYDAY") ?? "").split(",").filter(Boolean)),
    until: parts.get("UNTIL") ?? "",
  };
}

function untilToDate(until: string): string {
  if (!until) return "";
  // UNTIL=20261231T235959Z → 2026-12-31
  const m = until.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

function dateToUntil(date: string): string {
  return date.replace(/-/g, "") + "T235959Z";
}

function formatPreview(freq: string, interval: number, byDay: Set<string>, startTime: string, endTime: string, startDate: string, until: string): string {
  const freqLabel = freq === "MONTHLY" ? (interval > 1 ? `${interval} months` : "month") : (interval > 1 ? `${interval} weeks` : "week");
  const dayNames = DAYS.filter((d) => byDay.has(d.code)).map((d) => DAY_LABELS[d.code]);
  const daysPart = dayNames.length ? dayNames.join(", ") : "";
  const timePart = startTime && endTime ? `${startTime}\u2013${endTime}` : startTime || "";
  const datePart = startDate
    ? new Date(startDate + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : "";

  let text = `Every ${interval > 1 ? freqLabel : freq === "MONTHLY" ? "month" : "week"}`;
  if (daysPart && freq === "WEEKLY") text += ` on ${daysPart}`;
  if (timePart) text += `, ${timePart}`;
  if (datePart) text += `, starting ${datePart}`;
  if (until) {
    const untilDate = new Date(until + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
    text += ` until ${untilDate}`;
  }
  return text;
}

function computeDuration(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 90;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function RruleBuilder({
  rrule,
  dtstartLocal,
  durationMinutes,
  onChange,
}: {
  rrule: string;
  dtstartLocal: string;
  durationMinutes: string;
  onChange: (rrule: string, dtstartLocal: string, durationMinutes: string) => void;
}) {
  // Parse initial values
  const parsed = useMemo(() => parseRrule(rrule), [rrule]);

  const [freq, setFreq] = useState(parsed.freq);
  const [interval, setInterval] = useState(parsed.interval);
  const [byDay, setByDay] = useState(parsed.byDay);
  const [startDate, setStartDate] = useState(() => {
    // dtstartLocal might be "2026-05-01T19:00" (datetime-local) or "2026-05-01"
    if (!dtstartLocal) return "";
    return dtstartLocal.slice(0, 10);
  });
  const [startTime, setStartTime] = useState(() => {
    if (!dtstartLocal || dtstartLocal.length < 16) return "19:00";
    return dtstartLocal.slice(11, 16);
  });
  const [endTime, setEndTime] = useState(() => {
    const dur = parseInt(durationMinutes, 10) || 90;
    const st = dtstartLocal && dtstartLocal.length >= 16 ? dtstartLocal.slice(11, 16) : "19:00";
    return addMinutesToTime(st, dur);
  });
  const [hasEndDate, setHasEndDate] = useState(() => !!parsed.until);
  const [untilDate, setUntilDate] = useState(() => untilToDate(parsed.until));

  const duration = useMemo(() => computeDuration(startTime, endTime), [startTime, endTime]);

  const buildRrule = useCallback(() => {
    let rule = `FREQ=${freq};INTERVAL=${interval}`;
    if (freq === "WEEKLY" && byDay.size > 0) {
      rule += `;BYDAY=${Array.from(byDay).join(",")}`;
    }
    if (hasEndDate && untilDate) {
      rule += `;UNTIL=${dateToUntil(untilDate)}`;
    }
    return rule;
  }, [freq, interval, byDay, hasEndDate, untilDate]);

  const buildDtstart = useCallback(() => {
    if (!startDate) return "";
    return `${startDate}T${startTime || "00:00"}`;
  }, [startDate, startTime]);

  // Emit changes on any state change
  useEffect(() => {
    const newRrule = buildRrule();
    const newDtstart = buildDtstart();
    const newDuration = String(duration);
    onChange(newRrule, newDtstart, newDuration);
  }, [freq, interval, byDay, startDate, startTime, endTime, hasEndDate, untilDate]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleDay(code: string) {
    setByDay((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const preview = useMemo(
    () => formatPreview(freq, interval, byDay, startTime, endTime, startDate, hasEndDate ? untilDate : ""),
    [freq, interval, byDay, startTime, endTime, startDate, hasEndDate, untilDate],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Frequency row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Every</span>
        <input
          type="number"
          min={1}
          max={52}
          value={interval}
          onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
          style={{ width: 60 }}
        />
        <select value={freq} onChange={(e) => setFreq(e.target.value)}>
          <option value="WEEKLY">week(s)</option>
          <option value="MONTHLY">month(s)</option>
        </select>
      </div>

      {/* Day selector (weekly only) */}
      {freq === "WEEKLY" && (
        <div>
          <label style={{ display: "block", marginBottom: 4 }}>On days</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {DAYS.map((d) => (
              <button
                key={d.code}
                type="button"
                onClick={() => toggleDay(d.code)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: `1px solid ${byDay.has(d.code) ? "var(--accent, #1a73e8)" : "var(--border, #e0e0e0)"}`,
                  background: byDay.has(d.code) ? "var(--accent-bg, #e8f0fe)" : "var(--bg, #fff)",
                  color: byDay.has(d.code) ? "var(--accent, #1a73e8)" : "var(--ink, #333)",
                  fontWeight: byDay.has(d.code) ? 600 : 400,
                  cursor: "pointer",
                  fontSize: "0.85rem",
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Times */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
        <div>
          <label>Start time</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => {
              setStartTime(e.target.value);
              // Keep duration, update end time
              setEndTime(addMinutesToTime(e.target.value, duration));
            }}
          />
        </div>
        <div>
          <label>End time</label>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--muted, #888)", paddingBottom: 10 }}>
          {formatDuration(duration)}
        </div>
      </div>

      {/* Start date */}
      <div>
        <label>Series starts</label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </div>

      {/* End date */}
      <div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={hasEndDate}
            onChange={(e) => setHasEndDate(e.target.checked)}
            style={{ width: "auto" }}
          />
          <span style={{ fontWeight: 600 }}>Series ends</span>
        </label>
        {hasEndDate && (
          <input
            type="date"
            value={untilDate}
            onChange={(e) => setUntilDate(e.target.value)}
            style={{ marginTop: 4 }}
          />
        )}
      </div>

      {/* Preview */}
      <div
        style={{
          padding: "10px 14px",
          borderRadius: 6,
          background: "var(--surface, #f8f8f8)",
          border: "1px solid var(--border, #e0e0e0)",
          fontSize: "0.85rem",
          color: "var(--muted, #888)",
        }}
      >
        {preview}
      </div>
    </div>
  );
}

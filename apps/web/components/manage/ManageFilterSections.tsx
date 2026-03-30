"use client";

import { useState } from "react";

import { useI18n } from "../i18n/I18nProvider";

/* ── helpers ── */

function FilterRow({
  label,
  selected,
  count,
  onClick,
}: {
  label: string;
  selected: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`filter-row${selected ? " filter-row-selected" : ""}`}
      onClick={onClick}
    >
      <span className="filter-row-icon">{selected ? "−" : "+"}</span>
      <span className="filter-row-label">{label}</span>
      {count !== undefined && <span className="filter-row-count">{count}</span>}
    </button>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{label}</summary>
      <div className="kv">{children}</div>
    </details>
  );
}

function toggle(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
}

/* ── Status filter ── */

export function StatusFilter({
  options,
  value,
  counts,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string[];
  counts?: Record<string, number>;
  onChange: (v: string[]) => void;
}) {
  const { t } = useI18n();
  return (
    <Section label={t("manage.filters.status")}>
      {options.map((opt) => (
        <FilterRow
          key={opt.value}
          label={opt.label}
          selected={value.includes(opt.value)}
          count={counts !== undefined ? (counts[opt.value] ?? 0) : undefined}
          onClick={() => onChange(toggle(value, opt.value))}
        />
      ))}
    </Section>
  );
}

/* ── Faceted filter components (for manage pages) ── */

export function AttendanceFacetFilter({
  counts,
  value,
  onChange,
}: {
  counts: Record<string, number>;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { t } = useI18n();
  const modes = ["in_person", "online", "hybrid"] as const;
  const hasItems = modes.some((m) => (counts[m] ?? 0) > 0 || value.includes(m));
  if (!hasItems) return null;
  return (
    <Section label={t("eventSearch.attendance.anyEventType")}>
      {modes.map((mode) => {
        const count = counts[mode] ?? 0;
        if (count === 0 && !value.includes(mode)) return null;
        return (
          <FilterRow
            key={mode}
            label={t(`eventSearch.attendance.${mode}`)}
            selected={value.includes(mode)}
            count={count}
            onClick={() => onChange(toggle(value, mode))}
          />
        );
      })}
    </Section>
  );
}

export function PracticeFacetFilter({
  categories,
  counts,
  value,
  sectionLabel,
  onChange,
}: {
  categories: Array<{ id: string; label: string }>;
  counts: Record<string, number>;
  value: string[];
  sectionLabel: string;
  onChange: (v: string[]) => void;
}) {
  const visible = categories.filter((cat) => (counts[cat.id] ?? 0) > 0 || value.includes(cat.id));
  if (visible.length === 0) return null;
  return (
    <Section label={sectionLabel}>
      {visible.map((cat) => (
        <FilterRow
          key={cat.id}
          label={cat.label}
          selected={value.includes(cat.id)}
          count={counts[cat.id] ?? 0}
          onClick={() => onChange(toggle(value, cat.id))}
        />
      ))}
    </Section>
  );
}

export function FormatFacetFilter({
  formats,
  counts,
  value,
  getLabel,
  onChange,
}: {
  formats: Array<{ id: string; key: string; label: string }>;
  counts: Record<string, number>;
  value: string[];
  getLabel: (key: string, label: string) => string;
  onChange: (v: string[]) => void;
}) {
  const { t } = useI18n();
  const visible = formats.filter((fmt) => (counts[fmt.id] ?? 0) > 0 || value.includes(fmt.id));
  if (visible.length === 0) return null;
  return (
    <Section label={t("eventSearch.eventFormat")}>
      {visible.map((fmt) => (
        <FilterRow
          key={fmt.id}
          label={getLabel(fmt.key, fmt.label)}
          selected={value.includes(fmt.id)}
          count={counts[fmt.id] ?? 0}
          onClick={() => onChange(toggle(value, fmt.id))}
        />
      ))}
    </Section>
  );
}

export function LanguageFacetFilter({
  counts,
  value,
  getLabel,
  sectionLabel,
  onChange,
}: {
  counts: Record<string, number>;
  value: string[];
  getLabel: (code: string) => string;
  sectionLabel: string;
  onChange: (v: string[]) => void;
}) {
  const entries = Object.entries(counts)
    .filter(([k, c]) => c > 0 || value.includes(k))
    .sort(([a], [b]) => getLabel(a).localeCompare(getLabel(b)));
  if (entries.length === 0) return null;
  return (
    <Section label={sectionLabel}>
      {entries.map(([lang, count]) => (
        <FilterRow
          key={lang}
          label={getLabel(lang)}
          selected={value.includes(lang)}
          count={count}
          onClick={() => onChange(toggle(value, lang))}
        />
      ))}
    </Section>
  );
}

export function CountryFacetFilter({
  counts,
  value,
  getLabel,
  sectionLabel,
  onChange,
}: {
  counts: Record<string, number>;
  value: string[];
  getLabel: (code: string) => string;
  sectionLabel: string;
  onChange: (v: string[]) => void;
}) {
  const entries = Object.entries(counts)
    .filter(([k, c]) => c > 0 || value.includes(k))
    .sort(([a], [b]) => getLabel(a).localeCompare(getLabel(b)));
  if (entries.length === 0) return null;
  return (
    <Section label={sectionLabel}>
      {entries.map(([code, count]) => (
        <FilterRow
          key={code}
          label={getLabel(code)}
          selected={value.includes(code)}
          count={count}
          onClick={() => onChange(toggle(value, code))}
        />
      ))}
    </Section>
  );
}

export function RoleFacetFilter({
  roles,
  counts,
  value,
  getLabel,
  onChange,
}: {
  roles: Array<{ id: string; key: string; label: string }>;
  counts: Record<string, number>;
  value: string[];
  getLabel: (key: string) => string;
  onChange: (v: string[]) => void;
}) {
  const { t } = useI18n();
  const visible = roles.filter((r) => (counts[r.id] ?? 0) > 0 || value.includes(r.id));
  if (visible.length === 0) return null;
  return (
    <Section label={t("organizerSearch.hostType")}>
      {visible.map((role) => (
        <FilterRow
          key={role.id}
          label={getLabel(role.key)}
          selected={value.includes(role.id)}
          count={counts[role.id] ?? 0}
          onClick={() => onChange(toggle(value, role.id))}
        />
      ))}
    </Section>
  );
}

export function CityFacetFilter({
  counts,
  value,
  getLabel,
  sectionLabel,
  onChange,
}: {
  counts: Record<string, number>;
  value: string[];
  getLabel: (city: string) => string;
  sectionLabel: string;
  onChange: (v: string[]) => void;
}) {
  const entries = Object.entries(counts)
    .filter(([k, c]) => c > 0 || value.includes(k))
    .sort(([a], [b]) => getLabel(a).localeCompare(getLabel(b)));
  if (entries.length === 0) return null;
  return (
    <Section label={sectionLabel}>
      {entries.map(([city, count]) => (
        <FilterRow
          key={city}
          label={getLabel(city)}
          selected={value.includes(city)}
          count={count}
          onClick={() => onChange(toggle(value, city))}
        />
      ))}
    </Section>
  );
}

export function TagsFacetFilter({
  counts,
  value,
  getLabel,
  sectionLabel,
  onChange,
}: {
  counts: Record<string, number>;
  value: string[];
  getLabel: (tag: string) => string;
  sectionLabel: string;
  onChange: (v: string[]) => void;
}) {
  const entries = Object.entries(counts)
    .filter(([k, c]) => c > 0 || value.includes(k))
    .sort(([a, ca], [b, cb]) => cb - ca || getLabel(a).localeCompare(getLabel(b)));
  if (entries.length === 0) return null;
  return (
    <Section label={sectionLabel}>
      {entries.map(([tag, count]) => (
        <FilterRow
          key={tag}
          label={getLabel(tag)}
          selected={value.includes(tag)}
          count={count}
          onClick={() => onChange(toggle(value, tag))}
        />
      ))}
    </Section>
  );
}

/* ── Source filter (admin events only) ── */

export function SourceFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  const options = [
    { value: "imported", label: t("manage.admin.events.importedOnly") },
    { value: "manual", label: t("manage.admin.events.manualOnly") },
    { value: "detached", label: t("manage.admin.events.detachedOnly") },
  ];
  return (
    <Section label={t("manage.filters.source")}>
      {options.map((opt) => (
        <FilterRow
          key={opt.value}
          label={opt.label}
          selected={value === opt.value}
          onClick={() => onChange(value === opt.value ? "" : opt.value)}
        />
      ))}
    </Section>
  );
}

/* ── Ownership filter (admin events only) ── */

export function OwnershipFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  const options = [
    { value: "has_owner", label: t("manage.admin.events.hasOwner") },
    { value: "unassigned", label: t("manage.admin.events.unassigned") },
  ];
  return (
    <Section label={t("manage.filters.ownership")}>
      {options.map((opt) => (
        <FilterRow
          key={opt.value}
          label={opt.label}
          selected={value === opt.value}
          onClick={() => onChange(value === opt.value ? "" : opt.value)}
        />
      ))}
    </Section>
  );
}

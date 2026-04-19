"use client";

import type { WhenPreset } from "../discoverTypes";

type WhenOption = {
  id: WhenPreset;
  label: string;
  icon: string;
};

const WHEN_OPTIONS: WhenOption[] = [
  { id: "today", label: "Today", icon: "☀️" },
  { id: "tomorrow", label: "Tomorrow", icon: "🌅" },
  { id: "this_weekend", label: "This weekend", icon: "🌙" },
  { id: "this_week", label: "This week", icon: "📅" },
  { id: "next_weekend", label: "Next weekend", icon: "🌃" },
  { id: "next_week", label: "Next week", icon: "➡️" },
  { id: "next_month", label: "Next month", icon: "📆" },
];

type Props = {
  selected: WhenPreset[];
  dateCounts: Partial<Record<WhenPreset, number>>;
  onToggle: (preset: WhenPreset) => void;
};

export function WhenStep({ selected, dateCounts, onToggle }: Props) {
  return (
    <div className="discover-step">
      <h2 className="discover-step-title">When works for you?</h2>
      <p className="discover-step-subtitle">Pick one or more, or skip to see all dates</p>
      <div className="discover-card-grid discover-card-grid--3col">
        {WHEN_OPTIONS.map((opt) => {
          const isSelected = selected.includes(opt.id);
          const count = dateCounts[opt.id];
          return (
            <button
              key={opt.id}
              type="button"
              className={`discover-card${isSelected ? " discover-card--selected" : ""}`}
              onClick={() => onToggle(opt.id)}
              aria-pressed={isSelected}
            >
              <span className="discover-card__icon">{opt.icon}</span>
              <span className="discover-card__label">{opt.label}</span>
              {count !== undefined && (
                <span className="discover-card__count">
                  {count} {count === 1 ? "event" : "events"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

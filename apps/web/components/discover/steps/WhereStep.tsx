"use client";

import type { WhereChoice } from "../discoverTypes";

type WhereOption = {
  id: WhereChoice;
  label: string;
  icon: string;
};

const WHERE_OPTIONS: WhereOption[] = [
  { id: "near_me", label: "Near me", icon: "📍" },
  { id: "my_region", label: "My country", icon: "🏠" },
  { id: "anywhere", label: "Anywhere", icon: "🌍" },
  { id: "europe", label: "Europe", icon: "🇪🇺" },
  { id: "americas", label: "Americas", icon: "🌎" },
];

type Props = {
  selected: WhereChoice | null;
  counts: Partial<Record<WhereChoice, number>>;
  onSelect: (choice: WhereChoice) => void;
};

export function WhereStep({ selected, counts, onSelect }: Props) {
  return (
    <div className="discover-step">
      <h2 className="discover-step-title">Where are you looking?</h2>
      <p className="discover-step-subtitle">Choose a region, or skip to search everywhere</p>
      <div className="discover-card-grid discover-card-grid--3col">
        {WHERE_OPTIONS.map((opt) => {
          const isSelected = selected === opt.id;
          const count = counts[opt.id];
          return (
            <button
              key={opt.id}
              type="button"
              className={`discover-card${isSelected ? " discover-card--selected" : ""}`}
              onClick={() => onSelect(opt.id)}
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

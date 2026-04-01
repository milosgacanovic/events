"use client";

import type { WhereChoice } from "../discoverTypes";

type WhereOption = {
  id: WhereChoice;
  label: string;
  icon: string;
};

const WHERE_OPTIONS: WhereOption[] = [
  { id: "near_me", label: "Near me", icon: "📍" },
  { id: "anywhere", label: "Anywhere", icon: "🌍" },
  { id: "europe", label: "Europe", icon: "🇪🇺" },
  { id: "americas", label: "Americas", icon: "🌎" },
];

type Props = {
  selected: WhereChoice | null;
  onSelect: (choice: WhereChoice) => void;
};

export function WhereStep({ selected, onSelect }: Props) {
  return (
    <div className="discover-step">
      <h2 className="discover-step-title">Where are you looking?</h2>
      <p className="discover-step-subtitle">Choose a region, or skip to search everywhere</p>
      <div className="discover-card-grid discover-card-grid--4col">
        {WHERE_OPTIONS.map((opt) => {
          const isSelected = selected === opt.id;
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
            </button>
          );
        })}
      </div>
    </div>
  );
}

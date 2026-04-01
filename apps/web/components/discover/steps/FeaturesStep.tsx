"use client";

import type { FeatureTag } from "../discoverTypes";

type FeatureOption = {
  id: FeatureTag;
  label: string;
  icon: string;
};

const FEATURE_OPTIONS: FeatureOption[] = [
  { id: "live-music", label: "Live music", icon: "🎵" },
  { id: "outdoor", label: "Outdoor / nature", icon: "🌿" },
  { id: "beginner-friendly", label: "Beginner friendly", icon: "🤝" },
  { id: "cacao-ceremony", label: "Cacao ceremony", icon: "🍫" },
  { id: "womens-circle", label: "Women's circle", icon: "🌺" },
  { id: "multi-day-retreat", label: "Multi-day retreat", icon: "🏕️" },
];

type Props = {
  selected: FeatureTag[];
  onToggle: (feature: FeatureTag) => void;
};

export function FeaturesStep({ selected, onToggle }: Props) {
  return (
    <div className="discover-step">
      <h2 className="discover-step-title">Any special features?</h2>
      <p className="discover-step-subtitle">Pick as many as you like, or skip</p>
      <div className="discover-card-grid discover-card-grid--3col">
        {FEATURE_OPTIONS.map((opt) => {
          const isSelected = selected.includes(opt.id);
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
            </button>
          );
        })}
      </div>
    </div>
  );
}

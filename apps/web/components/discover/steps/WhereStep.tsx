"use client";

import type { WhereChoice } from "../discoverTypes";

type WhereOption = {
  id: WhereChoice;
  label: string;
  icon: string;
  needsGeo?: boolean;
};

const WHERE_OPTIONS: WhereOption[] = [
  { id: "near_me", label: "Near me", icon: "📍", needsGeo: true },
  { id: "my_region", label: "My region", icon: "🏠", needsGeo: true },
  { id: "anywhere", label: "Anywhere", icon: "🌍" },
  { id: "europe", label: "Europe", icon: "🇪🇺" },
  { id: "americas", label: "Americas", icon: "🌎" },
];

function geoStatusLabel(status: string): string | null {
  switch (status) {
    case "detecting": return "Detecting location...";
    case "denied": return "Location access denied";
    case "unavailable": return "Location unavailable";
    case "no_events": return "No events nearby";
    default: return null;
  }
}

type Props = {
  selected: WhereChoice | null;
  counts: Partial<Record<WhereChoice, number>>;
  geoStatus: string;
  onSelect: (choice: WhereChoice) => void;
};

export function WhereStep({ selected, counts, geoStatus, onSelect }: Props) {
  const geoReady = geoStatus === "ready";
  const geoLoading = geoStatus === "detecting";
  const geoFailed = geoStatus === "denied" || geoStatus === "unavailable";
  const statusLabel = !geoReady ? geoStatusLabel(geoStatus) : null;

  return (
    <div className="discover-step">
      <h2 className="discover-step-title">Where are you looking?</h2>
      <p className="discover-step-subtitle">Choose a region, or skip to search everywhere</p>
      <div className="discover-card-grid discover-card-grid--3col">
        {WHERE_OPTIONS.map((opt) => {
          const isSelected = selected === opt.id;
          const count = counts[opt.id];
          const isGeoCard = opt.needsGeo;
          const disabled = isGeoCard && geoFailed;

          return (
            <button
              key={opt.id}
              type="button"
              className={`discover-card${isSelected ? " discover-card--selected" : ""}${disabled ? " discover-card--disabled" : ""}`}
              onClick={() => !disabled && onSelect(opt.id)}
              aria-pressed={isSelected}
              disabled={disabled}
            >
              <span className="discover-card__icon">{opt.icon}</span>
              <span className="discover-card__label">{opt.label}</span>
              {isGeoCard && geoLoading && (
                <span className="discover-card__status">Detecting...</span>
              )}
              {isGeoCard && geoFailed && statusLabel && (
                <span className="discover-card__status discover-card__status--error">{statusLabel}</span>
              )}
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

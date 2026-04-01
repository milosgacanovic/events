"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "../../../lib/api";
import type { TaxonomyResponse } from "../../EventSearchClient";
import type { MoodId, WhenPreset, WhereChoice, FeatureTag } from "../discoverTypes";
import {
  resolveMoodMapping,
  resolveWhereChoice,
  resolveFeatureTags,
  MOOD_MAPPINGS,
} from "../discoverMappings";

const MOOD_LABELS: Record<MoodId, string> = {
  gentle: "Gentle & grounding",
  wild: "Wild & ecstatic",
  deep: "Deep & transformative",
  open: "Open to anything",
};

const WHEN_LABELS: Record<WhenPreset, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  this_weekend: "This weekend",
  this_week: "This week",
  next_week: "Next week",
  next_month: "Next month",
};

const WHERE_LABELS: Record<WhereChoice, string> = {
  near_me: "Near me",
  my_region: "My country",
  anywhere: "Anywhere",
  europe: "Europe",
  americas: "Americas",
};

const FEATURE_LABELS: Record<FeatureTag, string> = {
  "live-music": "Live music",
  "outdoor": "Outdoor / nature",
  "beginner-friendly": "Beginner friendly",
  "cacao-ceremony": "Cacao ceremony",
  "womens-circle": "Women's circle",
  "multi-day-retreat": "Multi-day retreat",
};

type Props = {
  mood: MoodId | null;
  when: WhenPreset[];
  where: WhereChoice | null;
  features: FeatureTag[];
  taxonomy: TaxonomyResponse | null;
  geoCity: string | null;
  geoCountryCode: string | null;
  onShowEvents: () => void;
  onStartOver: () => void;
};

export function SummaryStep({
  mood,
  when,
  where,
  features,
  taxonomy,
  geoCity,
  geoCountryCode,
  onShowEvents,
  onStartOver,
}: Props) {
  const [resultCount, setResultCount] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ pageSize: "1", page: "1" });
    if (mood && mood !== "open" && taxonomy) {
      const resolved = resolveMoodMapping(mood, taxonomy);
      if (resolved.practiceCategoryIds.length)
        params.set("practiceCategoryId", resolved.practiceCategoryIds.join(","));
      if (resolved.tags.length)
        params.set("tags", resolved.tags.join(","));
    }
    if (when.length) params.set("eventDate", when.join(","));
    if (where === "near_me") {
      if (geoCity) params.set("city", geoCity);
      else if (geoCountryCode) params.set("countryCode", geoCountryCode);
    } else if (where === "my_region") {
      if (geoCountryCode) params.set("countryCode", geoCountryCode);
    } else if (where && where !== "anywhere") {
      const codes = resolveWhereChoice(where);
      if (codes.length) params.set("countryCode", codes.join(","));
    }
    if (features.length) {
      const tags = resolveFeatureTags(features);
      const existing = params.get("tags");
      const combined = existing ? `${existing},${tags.join(",")}` : tags.join(",");
      params.set("tags", combined);
    }

    let cancelled = false;
    fetchJson<{ totalHits: number }>(`/events/search?${params}`)
      .then((res) => { if (!cancelled) setResultCount(res.totalHits); })
      .catch(() => { if (!cancelled) setResultCount(null); });
    return () => { cancelled = true; };
  }, [mood, when, where, features, taxonomy, geoCity, geoCountryCode]);

  return (
    <div className="discover-step">
      <h2 className="discover-step-title">Your discovery</h2>
      <div className="discover-summary">
        <div className="discover-summary-selections">
          {mood && (
            <div className="discover-summary-row">
              <span className="discover-summary-row__label">Mood</span>
              <span className="discover-summary-row__value">{MOOD_LABELS[mood]}</span>
            </div>
          )}
          {when.length > 0 && (
            <div className="discover-summary-row">
              <span className="discover-summary-row__label">When</span>
              <span className="discover-summary-row__value">
                {when.map((w) => WHEN_LABELS[w]).join(", ")}
              </span>
            </div>
          )}
          {where && (
            <div className="discover-summary-row">
              <span className="discover-summary-row__label">Where</span>
              <span className="discover-summary-row__value">
                {where === "near_me" && geoCity ? `Near me (${geoCity})` : WHERE_LABELS[where]}
              </span>
            </div>
          )}
          {features.length > 0 && (
            <div className="discover-summary-row">
              <span className="discover-summary-row__label">Features</span>
              <span className="discover-summary-row__value">
                {features.map((f) => FEATURE_LABELS[f]).join(", ")}
              </span>
            </div>
          )}
        </div>

        {resultCount !== null && (
          <>
            <div className="discover-summary-count">{resultCount}</div>
            <div className="discover-summary-count-label">
              {resultCount === 1 ? "event found" : "events found"}
            </div>
          </>
        )}

        <div className="discover-summary-actions">
          <button type="button" className="discover-nav-btn" onClick={onStartOver}>
            Start over
          </button>
          <button type="button" className="discover-nav-btn discover-nav-btn--primary" onClick={onShowEvents}>
            Show events
          </button>
        </div>
      </div>
    </div>
  );
}

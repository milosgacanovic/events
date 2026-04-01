"use client";

import { useReducer, useCallback, useEffect, useRef } from "react";
import "./DiscoverWizard.css";
import type {
  WizardState,
  WizardAction,
  DiscoverWizardProps,
  MoodId,
  WhenPreset,
  WhereChoice,
  FeatureTag,
} from "./discoverTypes";
import {
  resolveMoodMapping,
  resolveWhereChoice,
  resolveFeatureTags,
  buildMoodSearchParams,
  WHEN_PRESETS,
  WHERE_IDS,
  FEATURE_IDS,
  FEATURE_TAG_MAP,
  MOOD_IDS,
  REGION_COUNTRY_CODES,
} from "./discoverMappings";
import { fetchJson } from "../../lib/api";
import type { GeoState } from "../../lib/useGeolocation";
import { MoodStep } from "./steps/MoodStep";
import { WhenStep } from "./steps/WhenStep";
import { WhereStep } from "./steps/WhereStep";
import { FeaturesStep } from "./steps/FeaturesStep";
import { SummaryStep } from "./steps/SummaryStep";

const TOTAL_STEPS = 5; // 0=mood, 1=where, 2=when, 3=features, 4=summary

const initialState: WizardState = {
  currentStep: 0,
  mood: null,
  when: [],
  where: null,
  features: [],
  moodTransition: false,
  dateCounts: {},
  whereCounts: {},
  featureCounts: {},
  moodCounts: {},
};

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_MOOD":
      return { ...state, mood: action.mood, moodTransition: true };
    case "TOGGLE_WHEN": {
      const has = state.when.includes(action.preset);
      return {
        ...state,
        when: has
          ? state.when.filter((p) => p !== action.preset)
          : [...state.when, action.preset],
      };
    }
    case "SET_WHERE":
      return { ...state, where: action.choice };
    case "TOGGLE_FEATURE": {
      const has = state.features.includes(action.feature);
      return {
        ...state,
        features: has
          ? state.features.filter((f) => f !== action.feature)
          : [...state.features, action.feature],
      };
    }
    case "GO_TO_STEP":
      return { ...state, currentStep: action.step, moodTransition: false };
    case "SET_DATE_COUNTS":
      return { ...state, dateCounts: action.counts };
    case "SET_WHERE_COUNTS":
      return { ...state, whereCounts: action.counts };
    case "SET_FEATURE_COUNTS":
      return { ...state, featureCounts: action.counts };
    case "SET_MOOD_COUNTS":
      return { ...state, moodCounts: action.counts };
    case "RESET":
      return { ...initialState };
    default:
      return state;
  }
}

type GeoHook = GeoState & { detect: () => void };

async function fetchCount(params: URLSearchParams): Promise<number> {
  try {
    const res = await fetchJson<{ totalHits: number }>(`/events/search?${params}`);
    return res.totalHits;
  } catch {
    return 0;
  }
}

function applyWhereToParams(
  params: URLSearchParams,
  where: WhereChoice | null,
  geo: GeoHook | undefined,
) {
  if (where === "near_me" && geo?.city) {
    params.set("city", geo.city);
  } else if (where === "my_region" && geo?.lat != null && geo?.lng != null) {
    params.set("geoLat", String(geo.lat));
    params.set("geoLng", String(geo.lng));
    params.set("geoRadius", "300000");
  } else if (where && where !== "anywhere" && where !== "near_me" && where !== "my_region") {
    const codes = resolveWhereChoice(where);
    if (codes.length) params.set("countryCode", codes.join(","));
  }
}

export function DiscoverWizard({ taxonomy, onComplete, onCancel, geo }: DiscoverWizardProps & { geo?: GeoHook }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trigger geolocation detection when entering Where step
  useEffect(() => {
    if (state.currentStep === 1 && geo && geo.status === "idle") {
      geo.detect();
    }
  }, [state.currentStep, geo]);

  // Fetch mood counts on mount (step 0)
  useEffect(() => {
    if (state.currentStep !== 0 || !taxonomy) return;
    let cancelled = false;
    Promise.all(
      MOOD_IDS.map(async (moodId) => {
        const params = buildMoodSearchParams(moodId, taxonomy);
        const count = await fetchCount(params);
        return [moodId, count] as const;
      }),
    ).then((entries) => {
      if (!cancelled) dispatch({ type: "SET_MOOD_COUNTS", counts: Object.fromEntries(entries) });
    });
    return () => { cancelled = true; };
  }, [state.currentStep, taxonomy]);

  // Step 1 = Where — fetch counts per location option
  // Re-runs when geo becomes ready
  useEffect(() => {
    if (state.currentStep !== 1) return;
    let cancelled = false;

    const geoReady = geo?.status === "ready" && geo.lat != null && geo.lng != null;

    Promise.all(
      WHERE_IDS.map(async (whereId) => {
        const params = buildMoodSearchParams(state.mood, taxonomy);

        if (whereId === "near_me") {
          if (!geoReady) return [whereId, undefined] as const;
          if (geo!.city) params.set("city", geo!.city);
          else if (geo!.countryCode) params.set("countryCode", geo!.countryCode);
        } else if (whereId === "my_region") {
          if (!geoReady) return [whereId, undefined] as const;
          params.set("geoLat", String(geo!.lat));
          params.set("geoLng", String(geo!.lng));
          params.set("geoRadius", "300000");
        } else if (whereId === "europe") {
          params.set("countryCode", REGION_COUNTRY_CODES.europe.join(","));
        } else if (whereId === "americas") {
          params.set("countryCode", REGION_COUNTRY_CODES.americas.join(","));
        }
        // "anywhere" = no location filter
        const count = await fetchCount(params);
        return [whereId, count] as const;
      }),
    ).then((entries) => {
      if (!cancelled) {
        const counts: Partial<Record<WhereChoice, number>> = {};
        for (const [key, val] of entries) {
          if (val !== undefined) counts[key as WhereChoice] = val;
        }
        dispatch({ type: "SET_WHERE_COUNTS", counts });
      }
    });

    return () => { cancelled = true; };
  }, [state.currentStep, state.mood, taxonomy, geo?.status, geo?.lat, geo?.lng, geo?.city, geo?.countryCode]);

  // Step 2 = When — fetch counts per date preset
  useEffect(() => {
    if (state.currentStep !== 2) return;
    let cancelled = false;

    Promise.all(
      WHEN_PRESETS.map(async (preset) => {
        const params = buildMoodSearchParams(state.mood, taxonomy);
        params.set("eventDate", preset);
        applyWhereToParams(params, state.where, geo);
        const count = await fetchCount(params);
        return [preset, count] as const;
      }),
    ).then((entries) => {
      if (!cancelled) dispatch({ type: "SET_DATE_COUNTS", counts: Object.fromEntries(entries) });
    });

    return () => { cancelled = true; };
  }, [state.currentStep, state.mood, state.where, taxonomy, geo]);

  // Step 3 = Features — fetch counts per feature tag
  useEffect(() => {
    if (state.currentStep !== 3) return;
    let cancelled = false;

    Promise.all(
      FEATURE_IDS.map(async (featureId) => {
        const params = buildMoodSearchParams(state.mood, taxonomy);
        const tags = FEATURE_TAG_MAP[featureId];
        if (tags.length) params.set("tags", tags.join(","));
        applyWhereToParams(params, state.where, geo);
        if (state.when.length) params.set("eventDate", state.when.join(","));
        const count = await fetchCount(params);
        return [featureId, count] as const;
      }),
    ).then((entries) => {
      if (!cancelled) dispatch({ type: "SET_FEATURE_COUNTS", counts: Object.fromEntries(entries) });
    });

    return () => { cancelled = true; };
  }, [state.currentStep, state.mood, state.where, state.when, taxonomy, geo]);

  // Handle mood selection → expand animation → advance to step 1 (Where)
  const handleMoodSelect = useCallback((mood: MoodId) => {
    dispatch({ type: "SET_MOOD", mood });
    transitionTimerRef.current = setTimeout(() => {
      dispatch({ type: "GO_TO_STEP", step: 1 });
    }, 800);
  }, []);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  const goNext = useCallback(() => {
    const next = Math.min(state.currentStep + 1, 4) as WizardState["currentStep"];
    dispatch({ type: "GO_TO_STEP", step: next });
  }, [state.currentStep]);

  const goBack = useCallback(() => {
    if (state.currentStep === 0) {
      onCancel();
      return;
    }
    const prev = Math.max(state.currentStep - 1, 0) as WizardState["currentStep"];
    dispatch({ type: "GO_TO_STEP", step: prev });
  }, [state.currentStep, onCancel]);

  const handleShowEvents = useCallback(() => {
    const moodFilters = resolveMoodMapping(state.mood, taxonomy);
    const featureTags = resolveFeatureTags(state.features);
    const allTags = [...new Set([...moodFilters.tags, ...featureTags])];

    let countryCodes = resolveWhereChoice(state.where);
    let cities: string[] = [];
    let geoRadius: number | null = null;

    if (state.where === "near_me" && geo) {
      if (geo.lat != null && geo.lng != null) {
        geoRadius = 100000; // 100km for "near me"
      } else if (geo.city) {
        cities = [geo.city];
      } else if (geo.countryCode) {
        countryCodes = [geo.countryCode];
      }
    } else if (state.where === "my_region" && geo?.lat != null && geo?.lng != null) {
      geoRadius = 300000; // 300km for "my region"
    }

    onComplete({
      practiceCategoryIds: moodFilters.practiceCategoryIds,
      eventFormatIds: moodFilters.eventFormatIds,
      tags: allTags,
      eventDates: state.when,
      countryCodes,
      cities,
      attendanceModes: [],
      geoRadius,
    });
  }, [state, taxonomy, geo, onComplete]);

  const handleStartOver = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  // Step indicator
  const stepDots = Array.from({ length: TOTAL_STEPS }, (_, i) => {
    const isCurrent = i === state.currentStep;
    const isDone = i < state.currentStep;
    return (
      <div
        key={i}
        className={`discover-step-dot${isCurrent ? " discover-step-dot--current" : ""}${isDone ? " discover-step-dot--done" : ""}`}
      />
    );
  });

  const isSkippable = state.currentStep >= 1 && state.currentStep <= 3;
  const showNav = state.currentStep >= 1 && state.currentStep <= 3;

  return (
    <div className="discover-wizard">
      <div className="discover-steps">{stepDots}</div>
      <div className="discover-step-container">
        {state.currentStep === 0 && (
          <MoodStep
            selectedMood={state.mood}
            moodTransition={state.moodTransition}
            counts={state.moodCounts}
            onSelect={handleMoodSelect}
          />
        )}
        {state.currentStep === 1 && (
          <WhereStep
            selected={state.where}
            counts={state.whereCounts}
            geoStatus={geo?.status ?? "idle"}
            onSelect={(choice: WhereChoice) => dispatch({ type: "SET_WHERE", choice })}
          />
        )}
        {state.currentStep === 2 && (
          <WhenStep
            selected={state.when}
            dateCounts={state.dateCounts}
            onToggle={(preset: WhenPreset) => dispatch({ type: "TOGGLE_WHEN", preset })}
          />
        )}
        {state.currentStep === 3 && (
          <FeaturesStep
            selected={state.features}
            counts={state.featureCounts}
            onToggle={(feature: FeatureTag) => dispatch({ type: "TOGGLE_FEATURE", feature })}
          />
        )}
        {state.currentStep === 4 && (
          <SummaryStep
            mood={state.mood}
            when={state.when}
            where={state.where}
            features={state.features}
            taxonomy={taxonomy}
            geoCity={geo?.city ?? null}
            geoCountryCode={geo?.countryCode ?? null}
            geoLat={geo?.lat ?? null}
            geoLng={geo?.lng ?? null}
            onShowEvents={handleShowEvents}
            onStartOver={handleStartOver}
          />
        )}
      </div>

      {showNav && (
        <div className="discover-nav">
          <button type="button" className="discover-nav-btn" onClick={goBack}>
            Back
          </button>
          {isSkippable && (
            <button type="button" className="discover-skip" onClick={goNext}>
              Skip
            </button>
          )}
          <button
            type="button"
            className="discover-nav-btn discover-nav-btn--primary"
            onClick={goNext}
          >
            {state.currentStep === 3 ? "Review" : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}

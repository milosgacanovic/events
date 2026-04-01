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
  WHEN_PRESETS,
} from "./discoverMappings";
import { fetchJson } from "../../lib/api";
import { MoodStep } from "./steps/MoodStep";
import { WhenStep } from "./steps/WhenStep";
import { WhereStep } from "./steps/WhereStep";
import { FeaturesStep } from "./steps/FeaturesStep";
import { SummaryStep } from "./steps/SummaryStep";

const TOTAL_STEPS = 5; // 0-4

const initialState: WizardState = {
  currentStep: 0,
  mood: null,
  when: [],
  where: null,
  features: [],
  moodTransition: false,
  dateCounts: {},
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
    case "RESET":
      return { ...initialState };
    default:
      return state;
  }
}

type GeoHook = {
  status: string;
  city: string | null;
  countryCode: string | null;
};

export function DiscoverWizard({ taxonomy, onComplete, onCancel, geo }: DiscoverWizardProps & { geo?: GeoHook }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch date counts when mood is selected and we reach step 1
  useEffect(() => {
    if (state.currentStep !== 1) return;
    let cancelled = false;

    const moodFilters = resolveMoodMapping(state.mood, taxonomy);

    Promise.all(
      WHEN_PRESETS.map(async (preset) => {
        const params = new URLSearchParams({ pageSize: "1", page: "1", eventDate: preset });
        if (moodFilters.practiceCategoryIds.length)
          params.set("practiceCategoryId", moodFilters.practiceCategoryIds.join(","));
        if (moodFilters.tags.length)
          params.set("tags", moodFilters.tags.join(","));
        try {
          const res = await fetchJson<{ totalHits: number }>(`/events/search?${params}`);
          return [preset, res.totalHits] as const;
        } catch {
          return [preset, 0] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) {
        dispatch({ type: "SET_DATE_COUNTS", counts: Object.fromEntries(entries) });
      }
    });

    return () => { cancelled = true; };
  }, [state.currentStep, state.mood, taxonomy]);

  // Handle mood selection → expand animation → advance to step 1
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
    const whereCountryCodes = resolveWhereChoice(state.where);
    const featureTags = resolveFeatureTags(state.features);

    const allTags = [...new Set([...moodFilters.tags, ...featureTags])];

    let countryCodes = whereCountryCodes;
    let cities: string[] = [];

    if (state.where === "near_me" && geo) {
      if (geo.city) {
        cities = [geo.city];
      } else if (geo.countryCode) {
        countryCodes = [geo.countryCode];
      }
    }

    onComplete({
      practiceCategoryIds: moodFilters.practiceCategoryIds,
      eventFormatIds: moodFilters.eventFormatIds,
      tags: allTags,
      eventDates: state.when,
      countryCodes,
      cities,
      attendanceModes: [],
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

  const canGoNext =
    state.currentStep === 0 ? state.mood !== null :
    true;

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
            onSelect={handleMoodSelect}
          />
        )}
        {state.currentStep === 1 && (
          <WhenStep
            selected={state.when}
            dateCounts={state.dateCounts}
            onToggle={(preset: WhenPreset) => dispatch({ type: "TOGGLE_WHEN", preset })}
          />
        )}
        {state.currentStep === 2 && (
          <WhereStep
            selected={state.where}
            onSelect={(choice: WhereChoice) => dispatch({ type: "SET_WHERE", choice })}
          />
        )}
        {state.currentStep === 3 && (
          <FeaturesStep
            selected={state.features}
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
            disabled={!canGoNext}
          >
            {state.currentStep === 3 ? "Review" : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}

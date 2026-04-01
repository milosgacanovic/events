import type { TaxonomyResponse } from "../EventSearchClient";

export type MoodId = "gentle" | "wild" | "deep" | "open";

export type WhenPreset =
  | "today"
  | "tomorrow"
  | "this_weekend"
  | "this_week"
  | "next_week"
  | "next_month";

export type WhereChoice = "near_me" | "my_region" | "anywhere" | "europe" | "americas";

export type FeatureTag =
  | "live-music"
  | "outdoor"
  | "beginner-friendly"
  | "cacao-ceremony"
  | "womens-circle"
  | "multi-day-retreat";

export type WizardState = {
  currentStep: 0 | 1 | 2 | 3 | 4;
  mood: MoodId | null;
  when: WhenPreset[];
  where: WhereChoice | null;
  features: FeatureTag[];
  moodTransition: boolean;
  dateCounts: Partial<Record<WhenPreset, number>>;
  whereCounts: Partial<Record<WhereChoice, number>>;
  featureCounts: Partial<Record<FeatureTag, number>>;
  moodCounts: Partial<Record<MoodId, number>>;
};

export type WizardAction =
  | { type: "SET_MOOD"; mood: MoodId }
  | { type: "TOGGLE_WHEN"; preset: WhenPreset }
  | { type: "SET_WHERE"; choice: WhereChoice }
  | { type: "TOGGLE_FEATURE"; feature: FeatureTag }
  | { type: "GO_TO_STEP"; step: WizardState["currentStep"] }
  | { type: "SET_DATE_COUNTS"; counts: Partial<Record<WhenPreset, number>> }
  | { type: "SET_WHERE_COUNTS"; counts: Partial<Record<WhereChoice, number>> }
  | { type: "SET_FEATURE_COUNTS"; counts: Partial<Record<FeatureTag, number>> }
  | { type: "SET_MOOD_COUNTS"; counts: Partial<Record<MoodId, number>> }
  | { type: "RESET" };

export type ResolvedFilters = {
  practiceCategoryIds: string[];
  eventFormatIds: string[];
  tags: string[];
  eventDates: WhenPreset[];
  countryCodes: string[];
  cities: string[];
  attendanceModes: string[];
};

export type DiscoverWizardProps = {
  taxonomy: TaxonomyResponse | null;
  onComplete: (filters: ResolvedFilters) => void;
  onCancel: () => void;
};

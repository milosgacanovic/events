import type { TaxonomyResponse } from "../EventSearchClient";
import type { MoodId, FeatureTag, ResolvedFilters, WhereChoice, WhenPreset } from "./discoverTypes";

export type MoodMapping = {
  practiceKeys: string[];
  formatKeys: string[];
  tags: string[];
};

export const MOOD_MAPPINGS: Record<MoodId, MoodMapping> = {
  gentle: {
    practiceKeys: ["open-floor", "movement-medicine", "biodanza"],
    formatKeys: [],
    tags: ["gentle", "grounding", "meditation", "low-intensity"],
  },
  wild: {
    practiceKeys: ["ecstatic-dance", "5rhythms"],
    formatKeys: [],
    tags: ["ecstatic", "high-energy"],
  },
  deep: {
    practiceKeys: ["open-floor", "movement-medicine"],
    formatKeys: [],
    tags: ["ceremony", "cacao", "sound-healing", "transformative", "journey"],
  },
  open: {
    practiceKeys: [],
    formatKeys: [],
    tags: [],
  },
};

export const REGION_COUNTRY_CODES: Record<string, string[]> = {
  europe: [
    "al", "at", "ba", "be", "bg", "by", "ch", "cy", "cz", "de", "dk",
    "ee", "es", "fi", "fr", "gb", "gr", "hr", "hu", "ie", "is", "it",
    "lt", "lu", "lv", "md", "me", "mk", "mt", "nl", "no", "pl", "pt",
    "ro", "rs", "se", "si", "sk", "ua",
  ],
  americas: [
    "ar", "bo", "br", "ca", "cl", "co", "cr", "cu", "do", "ec", "gt",
    "hn", "jm", "mx", "ni", "pa", "pe", "pr", "py", "sv", "tt", "us",
    "uy", "ve",
  ],
};

export const FEATURE_TAG_MAP: Record<FeatureTag, string[]> = {
  "live-music": ["live-music", "live music"],
  "outdoor": ["outdoor", "nature", "outdoor/nature"],
  "beginner-friendly": ["beginner-friendly", "beginner friendly", "beginners"],
  "cacao-ceremony": ["cacao", "cacao-ceremony", "cacao ceremony"],
  "womens-circle": ["women", "womens-circle", "women's circle"],
  "multi-day-retreat": ["retreat", "multi-day", "multi-day retreat"],
};

export const WHEN_PRESETS: WhenPreset[] = [
  "today",
  "tomorrow",
  "this_weekend",
  "this_week",
  "next_week",
  "next_month",
];

export function resolveMoodMapping(
  mood: MoodId | null,
  taxonomy: TaxonomyResponse | null,
): Pick<ResolvedFilters, "practiceCategoryIds" | "eventFormatIds" | "tags"> {
  if (!mood || mood === "open" || !taxonomy) {
    return { practiceCategoryIds: [], eventFormatIds: [], tags: [] };
  }
  const mapping = MOOD_MAPPINGS[mood];
  const practiceCategoryIds = mapping.practiceKeys
    .map((key) => taxonomy.practices.categories.find((c) => c.key === key)?.id)
    .filter((id): id is string => !!id);
  const eventFormatIds = mapping.formatKeys
    .map((key) => taxonomy.eventFormats?.find((f) => f.key === key)?.id)
    .filter((id): id is string => !!id);
  return { practiceCategoryIds, eventFormatIds, tags: mapping.tags };
}

export function resolveWhereChoice(choice: WhereChoice | null): string[] {
  if (!choice || choice === "anywhere" || choice === "near_me") return [];
  return REGION_COUNTRY_CODES[choice] ?? [];
}

export function resolveFeatureTags(features: FeatureTag[]): string[] {
  const allTags: string[] = [];
  for (const f of features) {
    const mapped = FEATURE_TAG_MAP[f];
    if (mapped) allTags.push(...mapped);
  }
  return [...new Set(allTags)];
}

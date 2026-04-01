import type { TaxonomyResponse } from "../EventSearchClient";
import type { MoodId, FeatureTag, ResolvedFilters, WhereChoice, WhenPreset } from "./discoverTypes";

export type MoodMapping = {
  practiceKeys: string[];
  formatKeys: string[];
  tags: string[];
};

// Mood mappings use only practice categories (broad) — tags are intentionally
// empty so mood selection doesn't overly restrict results. Feature tags in
// step 4 handle the fine-grained filtering.
export const MOOD_MAPPINGS: Record<MoodId, MoodMapping> = {
  gentle: {
    practiceKeys: ["open-floor", "movement-medicine", "biodanza", "contact-improvisation"],
    formatKeys: [],
    tags: [],
  },
  wild: {
    practiceKeys: ["ecstatic-dance", "5rhythms", "free-dance"],
    formatKeys: [],
    tags: [],
  },
  deep: {
    practiceKeys: ["open-floor", "movement-medicine", "biodanza", "ecstatic-dance"],
    formatKeys: [],
    tags: [],
  },
  open: {
    practiceKeys: [],
    formatKeys: [],
    tags: [],
  },
};

export const MOOD_IDS: MoodId[] = ["gentle", "wild", "deep", "open"];

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

export const FEATURE_IDS: FeatureTag[] = [
  "live-music", "outdoor", "beginner-friendly",
  "cacao-ceremony", "womens-circle", "multi-day-retreat",
];

export const WHEN_PRESETS: WhenPreset[] = [
  "today",
  "tomorrow",
  "this_weekend",
  "this_week",
  "next_week",
  "next_month",
];

export const WHERE_IDS: WhereChoice[] = [
  "near_me", "my_region", "anywhere", "europe", "americas",
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
  if (!choice || choice === "anywhere" || choice === "near_me" || choice === "my_region") return [];
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

/** Build base search params from mood (practice categories only) */
export function buildMoodSearchParams(
  mood: MoodId | null,
  taxonomy: TaxonomyResponse | null,
): URLSearchParams {
  const params = new URLSearchParams({ pageSize: "1", page: "1" });
  if (mood && mood !== "open" && taxonomy) {
    const resolved = resolveMoodMapping(mood, taxonomy);
    if (resolved.practiceCategoryIds.length)
      params.set("practiceCategoryId", resolved.practiceCategoryIds.join(","));
  }
  return params;
}

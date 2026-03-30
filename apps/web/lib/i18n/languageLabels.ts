const languageLabelOverrides: Record<string, string> = {
  ais: "Nanti",
  ol: "Orukaiva",
  mul: "Multiple languages",
};

// Strip script subtag for cleaner display (e.g. "sr-latn" → "sr" → "Serbian" not "Serbian (Latin)")
const STRIP_SCRIPT_FOR_DISPLAY: Record<string, string> = {
  "sr-latn": "sr",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function labelForLanguageCode(
  code: string,
  displayNames: Intl.DisplayNames | null,
): string {
  const normalized = code.trim().toLowerCase();
  const baseCode = normalized.split("-")[0];
  const override = languageLabelOverrides[normalized] ?? languageLabelOverrides[baseCode];
  if (override) {
    return capitalize(override);
  }
  const lookupCode = STRIP_SCRIPT_FOR_DISPLAY[normalized] ?? normalized;
  const localized = displayNames?.of(lookupCode);
  const label = localized && localized !== lookupCode ? localized : code;
  return capitalize(label);
}

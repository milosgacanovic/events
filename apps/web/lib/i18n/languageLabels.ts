const languageLabelOverrides: Record<string, string> = {
  ais: "Nanti",
  ol: "Orukaiva",
  mul: "Multiple languages",
};

export function labelForLanguageCode(
  code: string,
  displayNames: Intl.DisplayNames | null,
): string {
  const normalized = code.trim().toLowerCase();
  const baseCode = normalized.split("-")[0];
  const override = languageLabelOverrides[normalized] ?? languageLabelOverrides[baseCode];
  if (override) {
    return override;
  }
  const localized = displayNames?.of(normalized);
  return localized && localized !== normalized ? localized : code;
}

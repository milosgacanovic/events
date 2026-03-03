const languageLabelOverrides: Record<string, string> = {
  ami: "Amis",
  ol: "Orukaiva",
  mul: "Multiple language",
};

export function labelForLanguageCode(
  code: string,
  displayNames: Intl.DisplayNames | null,
): string {
  const normalized = code.trim().toLowerCase();
  const override = languageLabelOverrides[normalized];
  if (override) {
    return override;
  }
  const localized = displayNames?.of(normalized);
  return localized && localized !== normalized ? localized : code;
}

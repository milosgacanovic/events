/**
 * Shared label/display helpers used by both public search pages and manage pages.
 */

export function getFormatLabel(key: string, label: string, t: (k: string) => string): string {
  const translated = t(`eventFormat.${key}`);
  return translated === `eventFormat.${key}` ? label : translated;
}

export function getRoleLabel(key: string, t: (k: string) => string): string {
  const translated = t(`roleType.${key}`);
  return translated === `roleType.${key}` ? key : translated;
}

export function toTitleCase(str: string): string {
  return str.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

export function formatCityLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return normalized;
  return normalized.replace(/(^|[\s-])([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

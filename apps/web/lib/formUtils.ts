export function csvToArray(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function isoToDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function ensureHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*?>/i.test(trimmed)) return trimmed;
  return trimmed
    .split(/\n\n+/)
    .map((para) => `<p>${escapeHtml(para.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function mergeLegacyOrganizerDescription(
  raw: Record<string, unknown> | null | undefined,
): string {
  const source = raw ?? {};
  const normalizeText = (value: unknown): string => {
    if (typeof value !== "string") return "";
    return value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+\n/g, "\n")
      .trim();
  };
  const bio = normalizeText(source.bio);
  const info = normalizeText(source.info);
  const description = normalizeText(source.description);
  const sections: Array<{ heading: string; value: string }> = [];
  if (bio) sections.push({ heading: "Bio", value: bio });
  if (info && info !== bio) sections.push({ heading: "Info", value: info });
  if (description && description !== bio && description !== info) {
    sections.push({ heading: "Description", value: description });
  }
  if (sections.length > 0) {
    return sections
      .map((s) => `<p>${escapeHtml(s.heading)}</p><p>${escapeHtml(s.value).replace(/\n/g, "<br>")}</p>`)
      .join("");
  }
  const fallbackCandidates = [source.html, source.text];
  for (const candidate of fallbackCandidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return `<p>${escapeHtml(normalized).replace(/\n/g, "<br>")}</p>`;
    }
  }
  return "";
}

export function deriveTaxonomyKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

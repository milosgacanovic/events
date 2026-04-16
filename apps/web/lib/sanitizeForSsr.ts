/**
 * Minimal server-only HTML stripper used during SSR as a defense-in-depth
 * measure. The authoritative sanitizer runs at the API write boundary
 * (`apps/api/src/utils/sanitizeHtml.ts`), so this function only exists to
 * catch legacy rows that were stored before write-side sanitization landed.
 *
 * On the client, components re-sanitize with DOMPurify after hydration — so
 * this is a first-paint safety net, not the primary defense.
 */

const DANGEROUS_TAGS = /<(script|iframe|object|embed|style|link|meta|form|base)[\s\S]*?<\/\1\s*>/gi;
const SELF_CLOSING_DANGEROUS = /<(script|iframe|object|embed|style|link|meta|form|base)[^>]*\/?>/gi;
const EVENT_HANDLERS = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URLS = /(href|src|action|formaction|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi;
const DATA_URLS_NON_IMAGE = /(href|src|action)\s*=\s*(["'])\s*data:(?!image\/)[^"']*\2/gi;

export function stripDangerousHtml(html: string): string {
  return html
    .replace(DANGEROUS_TAGS, "")
    .replace(SELF_CLOSING_DANGEROUS, "")
    .replace(EVENT_HANDLERS, "")
    .replace(JAVASCRIPT_URLS, "")
    .replace(DATA_URLS_NON_IMAGE, "");
}

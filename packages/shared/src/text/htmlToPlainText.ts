import { decodeHTML } from "entities";

import { truncateOnWord } from "./truncate";

// Block-level boundaries become a space BEFORE tags are stripped, so
// "<p>…the mystery.</p><p>Ilife…" doesn't collapse into "mystery.Ilife".
const BLOCK_TAG = /<\/?(?:p|div|br|li|ul|ol|dl|dt|dd|h[1-6]|tr|td|th|table|thead|tbody|blockquote|section|article|header|footer|aside|nav|pre|hr|figure|figcaption)\b[^>]*>/gi;

/**
 * The one HTML → plain-text conversion for meta descriptions, og:description
 * and JSON-LD `description` (events and hosts). SEO round 3, Task 5.
 *
 * - drops script/style/comments;
 * - block boundaries → space, then strips the remaining (inline) tags;
 * - decodes HTML entities EXACTLY ONCE (via `entities`, no hand-rolled chain);
 * - collapses whitespace, trims, optionally truncates on a word boundary.
 *
 * The result is plain text. Never escape it again — React/Next escape
 * attribute values and JSON.stringify handles JSON-LD. (Pre-escaping is what
 * produced `&amp;amp;` in host meta descriptions.)
 *
 * Lives in shared so the API measures host bio length (isHostIndexable) exactly
 * as the page renders it.
 */
export function htmlToPlainText(input: string | null | undefined, maxLength?: number): string {
  if (!input) return "";
  let s = input
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(BLOCK_TAG, " ")
    .replace(/<[^>]*>/g, "");
  s = decodeHTML(s);
  s = s.replace(/[\s ​]+/g, " ").trim();
  return maxLength ? truncateOnWord(s, maxLength) : s;
}

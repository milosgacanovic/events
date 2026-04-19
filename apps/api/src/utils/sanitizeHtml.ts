import sanitize from "sanitize-html";

/**
 * Allow-list HTML sanitizer for user-submitted `descriptionHtml` on organizers.
 * Called at the API write boundary so stored content is safe regardless of how
 * it is later rendered (SSR, client, email, etc.).
 *
 * Kept intentionally narrow — same tag set the RichTextEditor on /manage/hosts
 * can produce (plus a few headings). `<a>` links are forced to
 * `rel="noopener nofollow noreferrer"` + `target="_blank"` to prevent reverse
 * tabnabbing and SEO leakage from externally-linked hosts.
 */
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "ul", "ol", "li",
  "blockquote", "a", "img", "h2", "h3", "h4", "code", "pre",
];

const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ["href", "title", "rel", "target"],
  img: ["src", "alt", "title", "width", "height"],
};

const SAFE_PROTOCOLS = ["http", "https", "mailto", "tel"];

export function sanitizeDescriptionHtml(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const clean = sanitize(trimmed, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRS,
    allowedSchemes: SAFE_PROTOCOLS,
    allowedSchemesAppliedToAttributes: ["href", "src"],
    disallowedTagsMode: "discard",
    transformTags: {
      a: sanitize.simpleTransform("a", {
        rel: "noopener nofollow noreferrer",
        target: "_blank",
      }),
    },
  });

  return clean.trim() || null;
}

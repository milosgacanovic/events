export function extractEditorJsText(descriptionJson: unknown): string {
  if (!descriptionJson || typeof descriptionJson !== "object") {
    return "";
  }

  const record = descriptionJson as Record<string, unknown>;

  const maybeBlocks = record.blocks;
  if (Array.isArray(maybeBlocks)) {
    const textParts: string[] = [];

    for (const block of maybeBlocks) {
      if (!block || typeof block !== "object") {
        continue;
      }

      const data = (block as { data?: unknown }).data;
      if (!data || typeof data !== "object") {
        continue;
      }

      for (const value of Object.values(data)) {
        if (typeof value === "string") {
          textParts.push(value);
        }
        if (Array.isArray(value)) {
          for (const nestedValue of value) {
            if (typeof nestedValue === "string") {
              textParts.push(nestedValue);
            }
          }
        }
      }
    }

    const blocksText = textParts.join(" ").replace(/\s+/g, " ").trim();
    if (blocksText) {
      return blocksText;
    }
  }

  // Fallback for imported events that store descriptions as an HTML string
  // under `html` instead of EditorJS `blocks`. The frontend detail renderer
  // already handles this shape (EventDetailClient.tsx:196-219); without this
  // branch the Meili description_text field is empty for imported events, so
  // full-text search never matches body-only terms.
  const maybeHtml = record.html;
  if (typeof maybeHtml === "string" && maybeHtml.trim()) {
    return maybeHtml
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

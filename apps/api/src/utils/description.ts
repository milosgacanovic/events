export function extractEditorJsText(descriptionJson: unknown): string {
  if (!descriptionJson || typeof descriptionJson !== "object") {
    return "";
  }

  const maybeBlocks = (descriptionJson as { blocks?: unknown }).blocks;
  if (!Array.isArray(maybeBlocks)) {
    return "";
  }

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

  return textParts.join(" ").replace(/\s+/g, " ").trim();
}

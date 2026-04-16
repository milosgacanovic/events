import { describe, expect, it } from "vitest";

import { extractEditorJsText } from "./description";

describe("extractEditorJsText", () => {
  it("returns joined text from EditorJS blocks", () => {
    const input = {
      blocks: [
        { type: "paragraph", data: { text: "Hello world" } },
        { type: "header", data: { text: "A heading" } },
      ],
    };
    expect(extractEditorJsText(input)).toBe("Hello world A heading");
  });

  it("handles array values inside block data", () => {
    const input = {
      blocks: [{ type: "list", data: { items: ["one", "two", "three"] } }],
    };
    expect(extractEditorJsText(input)).toBe("one two three");
  });

  it("returns empty string when input is not an object", () => {
    expect(extractEditorJsText(null)).toBe("");
    expect(extractEditorJsText(undefined)).toBe("");
    expect(extractEditorJsText("string")).toBe("");
    expect(extractEditorJsText(42)).toBe("");
  });

  it("returns empty string when blocks is absent and html is absent", () => {
    expect(extractEditorJsText({})).toBe("");
    expect(extractEditorJsText({ importMeta: { source: "x" } })).toBe("");
  });

  it("falls back to stripping html when blocks is absent", () => {
    const input = {
      html: "<p>Weekly <strong>5Rhythms</strong> class in Raleigh.</p>",
    };
    expect(extractEditorJsText(input)).toBe("Weekly 5Rhythms class in Raleigh.");
  });

  it("decodes a minimal set of HTML entities in the html fallback", () => {
    const input = {
      html: "Fish &amp; chips &lt;br&gt; costs &quot;$5&quot; per &#39;plate&#39;&nbsp;only",
    };
    expect(extractEditorJsText(input)).toBe(
      "Fish & chips <br> costs \"$5\" per 'plate' only",
    );
  });

  it("collapses whitespace in the html fallback", () => {
    const input = {
      html: "<div>\n  <p>Line  one</p>\n  <p>Line\ttwo</p>\n</div>",
    };
    expect(extractEditorJsText(input)).toBe("Line one Line two");
  });

  it("prefers blocks over html when both are present and blocks yield text", () => {
    const input = {
      blocks: [{ type: "paragraph", data: { text: "from blocks" } }],
      html: "<p>from html</p>",
    };
    expect(extractEditorJsText(input)).toBe("from blocks");
  });

  it("falls back to html when blocks is present but yields no text", () => {
    const input = {
      blocks: [],
      html: "<p>from html</p>",
    };
    expect(extractEditorJsText(input)).toBe("from html");
  });

  it("returns empty string when html is an empty or whitespace-only string", () => {
    expect(extractEditorJsText({ html: "" })).toBe("");
    expect(extractEditorJsText({ html: "   \n\t  " })).toBe("");
  });
});

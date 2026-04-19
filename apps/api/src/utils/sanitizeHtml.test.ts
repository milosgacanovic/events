import { describe, expect, it } from "vitest";

import { sanitizeDescriptionHtml } from "./sanitizeHtml";

describe("sanitizeDescriptionHtml", () => {
  it("returns null for null/undefined/empty/whitespace input", () => {
    expect(sanitizeDescriptionHtml(null)).toBeNull();
    expect(sanitizeDescriptionHtml(undefined)).toBeNull();
    expect(sanitizeDescriptionHtml("")).toBeNull();
    expect(sanitizeDescriptionHtml("   \n\t  ")).toBeNull();
  });

  it("preserves allowed tags", () => {
    const html = "<p>Hello <strong>world</strong> and <em>you</em></p>";
    expect(sanitizeDescriptionHtml(html)).toBe(html);
  });

  it("strips disallowed tags like <script>", () => {
    const out = sanitizeDescriptionHtml("<p>hi</p><script>alert(1)</script>");
    expect(out).toBe("<p>hi</p>");
    expect(out).not.toMatch(/script/i);
  });

  it("strips <style> and <iframe> tags", () => {
    const out = sanitizeDescriptionHtml(
      "<p>ok</p><style>body{}</style><iframe src='x'></iframe>",
    );
    expect(out).toBe("<p>ok</p>");
  });

  it("forces safe rel+target on anchors", () => {
    const out = sanitizeDescriptionHtml('<a href="https://example.com">x</a>');
    expect(out).toContain('rel="noopener nofollow noreferrer"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('href="https://example.com"');
  });

  it("overrides attacker-supplied rel/target on anchors", () => {
    const out = sanitizeDescriptionHtml(
      '<a href="https://e.com" rel="dofollow" target="_self">x</a>',
    );
    expect(out).toContain('rel="noopener nofollow noreferrer"');
    expect(out).toContain('target="_blank"');
    expect(out).not.toContain("dofollow");
    expect(out).not.toContain('target="_self"');
  });

  it("drops javascript: hrefs", () => {
    const out = sanitizeDescriptionHtml('<a href="javascript:alert(1)">x</a>');
    expect(out ?? "").not.toContain("javascript:");
  });

  it("allows mailto: and tel: schemes", () => {
    expect(sanitizeDescriptionHtml('<a href="mailto:a@b.co">mail</a>'))
      .toContain("mailto:a@b.co");
    expect(sanitizeDescriptionHtml('<a href="tel:+15551234">call</a>'))
      .toContain("tel:+15551234");
  });

  it("strips on* event handlers", () => {
    const out = sanitizeDescriptionHtml('<p onclick="alert(1)">x</p>');
    expect(out).toBe("<p>x</p>");
  });

  it("strips unsupported attributes from img but keeps allowed ones", () => {
    const out = sanitizeDescriptionHtml(
      '<img src="https://e.com/a.jpg" alt="a" onerror="x()" style="x:1">',
    );
    expect(out).toContain('src="https://e.com/a.jpg"');
    expect(out).toContain('alt="a"');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("style");
  });

  it("returns null when input sanitizes to nothing", () => {
    expect(sanitizeDescriptionHtml("<script>x</script>")).toBeNull();
  });

  it("trims outer whitespace from clean output", () => {
    const out = sanitizeDescriptionHtml("   <p>hi</p>   ");
    expect(out).toBe("<p>hi</p>");
  });
});

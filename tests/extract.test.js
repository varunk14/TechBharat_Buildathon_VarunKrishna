import { describe, it, expect, beforeAll } from "vitest";
// Side-effect import: extract.js is a classic script that attaches its API to
// globalThis rather than exporting, because it is also injected into the page.
import "../lib/extract.js";

const { heuristicExtractMarkdown, headingPrefix } = globalThis.GlanceExtract;

function bodyFrom(html) {
  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    "text/html"
  );
  return doc.body;
}

describe("heuristicExtractMarkdown", () => {
  it("drops script, style, nav and footer content", () => {
    const body = bodyFrom(`
      <nav>Home About Contact</nav>
      <script>var tracking = 1;</script>
      <style>.a { color: red; }</style>
      <p>This is the real article content worth reading.</p>
      <footer>Copyright 2026 All rights reserved</footer>
    `);
    const out = heuristicExtractMarkdown(body);
    expect(out).toContain("real article content");
    expect(out).not.toContain("Home About Contact");
    expect(out).not.toContain("tracking");
    expect(out).not.toContain("color: red");
    expect(out).not.toContain("All rights reserved");
  });

  it("deduplicates repeated blocks", () => {
    const body = bodyFrom(`
      <p>Repeated notice.</p>
      <p>Repeated notice.</p>
      <p>Unique paragraph.</p>
    `);
    const out = heuristicExtractMarkdown(body);
    const occurrences = out.split("Repeated notice.").length - 1;
    expect(occurrences).toBe(1);
    expect(out).toContain("Unique paragraph.");
  });

  it("maps heading levels to the correct markdown prefix", () => {
    const body = bodyFrom(`<h1>Title</h1><h2>Section</h2><h3>Detail</h3>`);
    const out = heuristicExtractMarkdown(body);
    expect(out).toContain("# Title");
    expect(out).toContain("## Section");
    expect(out).toContain("### Detail");
  });
});

describe("headingPrefix", () => {
  it("returns the right number of hashes per heading tag", () => {
    expect(headingPrefix("H1")).toBe("#");
    expect(headingPrefix("H3")).toBe("###");
    expect(headingPrefix("H6")).toBe("######");
    expect(headingPrefix("P")).toBe("");
  });
});

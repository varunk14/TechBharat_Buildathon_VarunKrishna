import { describe, it, expect } from "vitest";
import { buildSynthesisInput, MAX_SYNTHESIS_TABS } from "../lib/synthesis.js";

const entry = (i) => ({
  title: `Page ${i}`,
  url: `https://example.com/${i}`,
  sections: { "TL;DR": `summary ${i}`, Numbers: `${i}00` },
});

describe("buildSynthesisInput", () => {
  it("numbers each source and includes title, url and section text", () => {
    const input = buildSynthesisInput([entry(1), entry(2)]);
    expect(input).toContain("Source 1: Page 1");
    expect(input).toContain("Source 2: Page 2");
    expect(input).toContain("https://example.com/2");
    expect(input).toContain("summary 1");
    expect(input).toContain("200");
    expect(input.split("=====")).toHaveLength(2);
  });

  it("caps the number of sources at the documented maximum", () => {
    const input = buildSynthesisInput([entry(1), entry(2), entry(3), entry(4)]);
    expect(MAX_SYNTHESIS_TABS).toBe(3);
    expect(input).toContain("Source 3");
    expect(input).not.toContain("Source 4");
  });
});

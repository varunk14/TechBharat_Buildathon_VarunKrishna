import { describe, it, expect } from "vitest";
import {
  parseSections,
  safeFilename,
  extractQuote,
  stripQuotes,
  buildExportMarkdown,
} from "../lib/markdown.js";

const complete = `## TL;DR
A short two-line summary of the page.

## Key Points
- First specific claim.
- Second specific claim.

## Numbers
- 42 percent growth in 2026.

## Actions & Decisions
- Renew the licence before March.`;

describe("parseSections", () => {
  it("extracts all four sections from a complete response", () => {
    const sections = parseSections(complete);
    expect(Object.keys(sections)).toEqual([
      "TL;DR",
      "Key Points",
      "Numbers",
      "Actions & Decisions",
    ]);
    expect(sections["TL;DR"]).toContain("two-line summary");
    expect(sections["Key Points"]).toContain("Second specific claim");
    expect(sections["Numbers"]).toContain("42 percent");
    expect(sections["Actions & Decisions"]).toContain("Renew the licence");
  });

  it("handles a response truncated mid-section without throwing", () => {
    const truncated = `## TL;DR
A short summary.

## Key Points
- First claim.
- Second cla`;
    let sections;
    expect(() => {
      sections = parseSections(truncated);
    }).not.toThrow();
    expect(sections["TL;DR"]).toContain("A short summary");
    expect(sections["Key Points"]).toContain("Second cla");
  });

  it("returns an empty object for text with no headers", () => {
    expect(parseSections("just some prose with no headings at all")).toEqual({});
    expect(parseSections("")).toEqual({});
  });
});

describe("extractQuote", () => {
  it("splits a bullet into display text and its source phrase", () => {
    const { text, quote } = extractQuote(
      "Profits rose sharply this quarter. [[profit of Rs. 13,492 crore]]"
    );
    expect(text).toBe("Profits rose sharply this quarter.");
    expect(quote).toBe("profit of Rs. 13,492 crore");
  });

  it("returns a null quote when no marker is present", () => {
    expect(extractQuote("Plain point.")).toEqual({
      text: "Plain point.",
      quote: null,
    });
  });

  it("handles punctuation after the marker and markers mid-sentence", () => {
    expect(extractQuote("The test succeeded [[test was successful]].")).toEqual({
      text: "The test succeeded.",
      quote: "test was successful",
    });
    expect(extractQuote("A [[quoted bit]] inside a sentence.")).toEqual({
      text: "A inside a sentence.",
      quote: "quoted bit",
    });
  });
});

describe("stripQuotes", () => {
  it("removes markers from exported markdown", () => {
    const sections = {
      "TL;DR": "Short.",
      "Key Points": "- A point. [[source phrase]]",
      Numbers: "None found",
      "Actions & Decisions": "None found",
    };
    const out = buildExportMarkdown({ title: "T", url: "u", sections });
    expect(out).toContain("A point.");
    expect(out).not.toContain("[[");
    expect(stripQuotes("x [[y]] z")).toBe("x z");
  });
});

describe("safeFilename", () => {
  it("is filesystem-safe for a title containing slashes and colons", () => {
    const name = safeFilename("Docs: sched / timers", "2026-08-06");
    expect(name).not.toMatch(/[\/\\:*?"<>|]/);
    expect(name.endsWith("-2026-08-06.md")).toBe(true);
  });
});

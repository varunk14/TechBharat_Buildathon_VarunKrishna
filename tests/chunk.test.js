import { describe, it, expect } from "vitest";
import { chunkText, estimateTokens } from "../lib/chunk.js";

describe("chunkText", () => {
  it("returns a single chunk when input is under the limit", () => {
    expect(chunkText("short text", 1000)).toHaveLength(1);
  });

  it("never exceeds the character limit per chunk beyond the overlap", () => {
    const input = Array.from({ length: 200 }, (_, i) =>
      `Paragraph ${i}. `.repeat(20)
    ).join("\n\n");
    const maxChars = 4000;
    const overlap = 200;
    for (const chunk of chunkText(input, maxChars, overlap)) {
      expect(chunk.length).toBeLessThanOrEqual(maxChars + overlap);
    }
  });

  it("splits only on paragraph boundaries, never mid-word", () => {
    const chunks = chunkText("one\n\ntwo\n\nthree", 10, 0);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // A fragment of one or two letters would mean a paragraph was cut.
      expect(chunk.trim()).not.toMatch(/^\w{1,2}$/);
    }
  });

  it("carries overlap from the previous chunk into the next", () => {
    const a = "AAAA ".repeat(600);
    const b = "BBBB ".repeat(600);
    const chunks = chunkText(`${a}\n\n${b}`, 2000, 300);
    expect(chunks.length).toBeGreaterThan(1);
    // The second chunk should begin with the tail of the first (the A block).
    expect(chunks[1].slice(0, 100)).toContain("A");
  });
});

describe("estimateTokens", () => {
  it("is within twenty percent of a known reference string", () => {
    // ~450 words of simple English. A real tokenizer lands around 450-560
    // tokens; 500 is a fair midpoint reference.
    const text = "the quick brown fox jumps over the lazy dog ".repeat(50);
    const estimate = estimateTokens(text);
    const reference = 500;
    expect(Math.abs(estimate - reference) / reference).toBeLessThan(0.2);
  });
});

import { describe, it, expect } from "vitest";
import { buildRequestBody, createSSEParser } from "../lib/providers/gemini.js";

const encoder = new TextEncoder();

function sseLine(text) {
  return `data: {"candidates":[{"content":{"parts":[{"text":${JSON.stringify(
    text
  )}}]}}]}\n`;
}

describe("createSSEParser", () => {
  it("parses a payload split across two chunks exactly once", () => {
    const parser = createSSEParser();
    const bytes = encoder.encode(sseLine("Hello"));
    const cut = 30; // inside the JSON, before the newline

    expect(parser.push(bytes.slice(0, cut))).toEqual([]);
    expect(parser.push(bytes.slice(cut))).toEqual(["Hello"]);
  });

  it("preserves a multi-byte character split across a chunk boundary", () => {
    const parser = createSSEParser();
    const bytes = encoder.encode(sseLine("తెలుగు"));
    // Cut one byte into the first Telugu character, so its UTF-8 bytes span
    // both chunks. Without { stream: true } this corrupts to a replacement
    // character.
    const prefix = 'data: {"candidates":[{"content":{"parts":[{"text":"';
    const cut = encoder.encode(prefix).length + 1;

    expect(parser.push(bytes.slice(0, cut))).toEqual([]);
    const deltas = parser.push(bytes.slice(cut));

    expect(deltas).toEqual(["తెలుగు"]);
    expect(deltas.join("")).not.toContain("�");
  });
});

describe("buildRequestBody", () => {
  it("builds the documented Gemini request shape", () => {
    const body = buildRequestBody({
      systemPrompt: "sys",
      userText: "page text",
      maxTokens: 1500,
    });

    expect(body).toEqual({
      system_instruction: { parts: [{ text: "sys" }] },
      contents: [{ role: "user", parts: [{ text: "page text" }] }],
      generationConfig: {
        maxOutputTokens: 1500,
        thinkingConfig: { thinkingLevel: "low" },
      },
    });
  });
});

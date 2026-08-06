import { describe, it, expect } from "vitest";
import {
  buildMessages,
  trimHistory,
  wrapContext,
  CONTEXT_OPEN,
  CONTEXT_CLOSE,
} from "../lib/conversation.js";

describe("buildMessages", () => {
  it("places the context turn first and the new question last", () => {
    const messages = buildMessages("page text", [], "What is the price?");
    expect(messages[0].role).toBe("user");
    expect(messages[0].parts[0].text).toContain("page text");
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.parts[0].text).toBe("What is the price?");
  });

  it("wraps the page text in delimiters in the context turn", () => {
    const messages = buildMessages("secret page body", [], "Q");
    const contextText = messages[0].parts[0].text;
    expect(contextText).toContain(CONTEXT_OPEN);
    expect(contextText).toContain(CONTEXT_CLOSE);
    expect(contextText).toContain("secret page body");
  });

  it("reuses the captured context for a second question, never re-fetching it", () => {
    // The context is passed in, not read from the page, so consecutive
    // questions cannot trigger a re-extraction. Both turns carry the same body.
    const first = buildMessages("captured body", [], "Q1");
    const history = [
      { role: "user", text: "Q1" },
      { role: "model", text: "A1" },
    ];
    const second = buildMessages("captured body", history, "Q2");
    expect(first[0].parts[0].text).toBe(second[0].parts[0].text);
    expect(second[0].parts[0].text).toContain("captured body");
  });
});

describe("trimHistory", () => {
  it("trims history longer than the limit from the oldest end", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "model",
      text: `turn ${i}`,
    }));
    const trimmed = trimHistory(history, 6);
    expect(trimmed).toHaveLength(6);
    expect(trimmed[0].text).toBe("turn 4");
    expect(trimmed[5].text).toBe("turn 9");
  });

  it("leaves short history unchanged", () => {
    const history = [{ role: "user", text: "only one" }];
    expect(trimHistory(history, 6)).toEqual(history);
  });
});

describe("wrapContext", () => {
  it("surrounds the text with both delimiters", () => {
    const wrapped = wrapContext("body");
    expect(wrapped.startsWith(CONTEXT_OPEN)).toBe(true);
    expect(wrapped.endsWith(CONTEXT_CLOSE)).toBe(true);
  });
});

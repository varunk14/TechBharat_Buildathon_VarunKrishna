import { describe, it, expect } from "vitest";
import { detectScript } from "../lib/lang.js";
import { languageInstruction } from "../lib/prompts.js";

describe("detectScript", () => {
  it("identifies Telugu, Devanagari, Tamil and Bengali samples", () => {
    expect(detectScript("ఈనాడు తెలుగు వార్తలు")).toBe("te");
    expect(detectScript("नमस्ते दुनिया")).toBe("hi");
    expect(detectScript("தமிழ் செய்திகள்")).toBe("ta");
    expect(detectScript("বাংলা খবর")).toBe("bn");
  });

  it("returns English for Latin text", () => {
    expect(detectScript("Hello world, this is plain English.")).toBe("en");
    expect(detectScript("")).toBe("en");
  });
});

describe("languageInstruction", () => {
  it("is empty for English and present for other languages", () => {
    expect(languageInstruction("en")).toBe("");
    expect(languageInstruction()).toBe("");
    expect(languageInstruction("te")).toContain("Telugu");
    expect(languageInstruction("hi")).toContain("Hindi");
  });
});

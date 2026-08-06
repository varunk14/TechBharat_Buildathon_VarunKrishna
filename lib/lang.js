// Script detection from Unicode ranges. Used to recognise the script a page is
// written in. Pure and unit tested; the output language is a separate user
// choice handled through storage and lib/prompts.js.

// Ordered so the more specific Indic blocks are checked before the shared
// Devanagari block. Returns a language-ish code for the dominant script.
const SCRIPTS = [
  { code: "te", range: /[ఀ-౿]/ }, // Telugu
  { code: "ta", range: /[஀-௿]/ }, // Tamil
  { code: "bn", range: /[ঀ-৿]/ }, // Bengali
  { code: "hi", range: /[ऀ-ॿ]/ }, // Devanagari (Hindi, Marathi)
];

export function detectScript(text) {
  const sample = text || "";
  for (const script of SCRIPTS) {
    if (script.range.test(sample)) return script.code;
  }
  return "en";
}

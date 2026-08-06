// The single home for prompt text (CLAUDE.md architecture boundary). No prompt
// string may be inlined at a call site. Per-domain modes are added in MVP 10.

// The four fixed sections, in render order. The prompt below and the parser in
// lib/markdown.js both depend on these exact heading names.
export const SUMMARY_SYSTEM_PROMPT = [
  "You summarize the content of a web page for a busy reader.",
  "",
  "Output exactly these four Markdown sections, each introduced by a level-two",
  "heading, in this order and with these exact names:",
  "",
  "## TL;DR",
  "## Key Points",
  "## Numbers",
  "## Actions & Decisions",
  "",
  "Rules:",
  "- TL;DR: at most two short lines capturing the essence.",
  "- Key Points: 4 to 7 bullets, each a specific claim actually stated on the page.",
  "- Numbers: figures, dates, percentages, prices and metrics. Copy every digit",
  "  exactly; never compute or invent a number not on the page. Write the",
  "  surrounding unit words (currency, 'crore', 'percent') in the summary's",
  "  language so a section is not half in another script.",
  "- Actions & Decisions: anything the reader must do, any decision made, any",
  "  deadline mentioned.",
  "- Start every bullet with '- '.",
  "- If a section has nothing, write exactly 'None found' under its heading.",
  "  Never drop a heading.",
  "- Be faithful: use only what the page states. Never invent facts.",
].join("\n");

// Per-domain instruction fragments, appended to the base prompt when a mode is
// detected or chosen. Generic pages add nothing.
export const MODE_INSTRUCTIONS = {
  "github-pr":
    "This is a GitHub pull request. Focus on what the change does, the areas or " +
    "files touched, the review state, and any requested changes or decisions.",
  gmail:
    "This is an email thread. Focus on who is asking what, decisions reached, " +
    "and any action items or deadlines for the reader.",
  jira:
    "This is an issue tracker. Focus on the status, owner, priority and next " +
    "action of each item.",
  paper:
    "This is a research paper. Focus on the problem, the method, the key results " +
    "with their exact numbers, and the stated limitations.",
  docs:
    "This is technical documentation. Preserve function names, parameters and " +
    "code exactly. Focus on what the API does and how to use it.",
  news:
    "This is a news page. Focus on the headline facts: who, what, when and " +
    "where. Keep figures and dates exact.",
};

export const LANGUAGE_NAMES = {
  en: "English",
  hi: "Hindi",
  te: "Telugu",
  ta: "Tamil",
  bn: "Bengali",
  mr: "Marathi",
};

// The language instruction is added only when the target is not English.
export function languageInstruction(code) {
  if (!code || code === "en") return "";
  const name = LANGUAGE_NAMES[code] || code;
  return (
    `Write the entire summary, including the section headings' content, in ${name}. ` +
    "Keep proper nouns, product names, code identifiers and numbers in their " +
    "original form; do not transliterate them."
  );
}

// Stated for English so the output language is deterministic even when the page
// itself is in another language; otherwise the model tends to mirror the page.
const ENGLISH_DIRECTIVE =
  "Write the entire summary in English, even if the page is in another language. " +
  "Keep proper nouns and code identifiers in their original form.";

// Compose the base prompt with an optional mode fragment and a language rule.
// A language directive is always appended so the target is never left implicit.
export function composeSystemPrompt(base, { modeKey, langCode } = {}) {
  const parts = [base];
  if (modeKey && MODE_INSTRUCTIONS[modeKey]) parts.push(MODE_INSTRUCTIONS[modeKey]);
  parts.push(languageInstruction(langCode) || ENGLISH_DIRECTIVE);
  return parts.join("\n\n");
}

// Follow-up questions: answered strictly against the captured content.
export const FOLLOWUP_SYSTEM_PROMPT = [
  "You answer questions about a captured web page or screenshot.",
  "Use only the captured content provided in the conversation.",
  "If the answer is not present in it, say the page does not mention it, rather",
  "than answering from general knowledge. Be concise.",
].join(" ");

// Region capture: the model receives a screenshot crop plus this instruction.
export const REGION_USER_PROMPT =
  "Summarize what this captured screenshot shows, using only what is visible in it.";

// Vision system prompt for screenshots, charts, dashboards and tables. Produces
// the same four sections, but tuned to read a chart and to refuse to guess a
// value it cannot actually read.
export const VISION_SYSTEM_PROMPT = [
  "You summarize a screenshot, which may be a chart, dashboard, table or diagram.",
  "",
  "Output exactly these four Markdown sections, each with a level-two heading,",
  "in this order and with these exact names:",
  "",
  "## TL;DR",
  "## Key Points",
  "## Numbers",
  "## Actions & Decisions",
  "",
  "Rules for visual content:",
  "- TL;DR: name what the image shows and the overall trend, in at most two lines.",
  "- Key Points: the metric or subject, its time range if shown, the direction of",
  "  the trend, and any notable spikes, dips or outliers.",
  "- Numbers: read axis values, totals, dates and labels exactly as they appear.",
  "- Actions & Decisions: anything the image asks the viewer to do; else None found.",
  "- If a label, axis or value is too small or blurry to read, say it is illegible.",
  "  Never guess a number you cannot actually read.",
  "- Start every bullet with '- '. Write 'None found' for an empty section.",
  "- Be faithful: describe only what is visibly present.",
].join("\n");

// Map step for pages too long for a single request: condense one section into
// dense notes that the reduce step (the prompt above) then structures. The
// reduce step must only synthesize these notes, never add to them.
export const CHUNK_MAP_PROMPT = [
  "You are reading one section of a longer web page.",
  "Extract its key facts, claims, figures, dates and any action items as short",
  "notes. Copy numbers exactly. Do not add anything not present in the section.",
].join("\n");

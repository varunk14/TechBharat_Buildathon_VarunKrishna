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
  "- Numbers: figures, dates, percentages, prices and metrics, copied exactly as",
  "  they appear. Never compute or infer a number that is not on the page.",
  "- Actions & Decisions: anything the reader must do, any decision made, any",
  "  deadline mentioned.",
  "- Start every bullet with '- '.",
  "- If a section has nothing, write exactly 'None found' under its heading.",
  "  Never drop a heading.",
  "- Be faithful: use only what the page states. Never invent facts.",
].join("\n");
